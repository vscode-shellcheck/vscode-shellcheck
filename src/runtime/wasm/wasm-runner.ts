import type {
  LintResult as PackageLintResult,
  ShellCheck,
} from "@vscode-shellcheck/shellcheck-wasm/client";
import { Logger } from "../../utils/logging/types.js";
import {
  DEFAULT_RUN_TIMEOUT_MS,
  LintRequest,
  LintResult,
  RunSupersededError,
  RunTimeoutError,
  RunnerDisposedError,
  ShellCheckRunner,
  WasmRuntimeError,
} from "../types.js";

/**
 * Lints at once when `shellcheck.maxConcurrentRuns` is 0. Each one holds a
 * worker of its own, well over 100 MiB while it runs, so unlike native
 * processes they are never left unlimited.
 */
export const DEFAULT_MAX_CONCURRENT_RUNS = 2;

/**
 * The GHC runtime cannot enter `PWD` and gives up before ShellCheck runs,
 * leaving stdout empty. Indistinguishable from a clean file at the parse
 * layer, so it has to be caught here.
 */
const CHDIR_FAILURE = "hs_init_ghc";

export interface WasmRunnerOptions {
  /** A package instance runs one lint at a time on a worker of its own. */
  createShellCheck(): ShellCheck;
  readonly logger: Logger;
  /** Key of the document the user is looking at, whose lint goes first. */
  activeDocumentKey(): string | undefined;
  /** The setting, 0 for the default. Read whenever a lint could start, so a
   * new limit applies from the next one on. */
  maxConcurrentRuns(): number;
}

interface PendingRun {
  readonly request: LintRequest;
  readonly resolve: (result: LintResult) => void;
  readonly reject: (error: Error) => void;
}

interface RunningRun {
  readonly documentKey: string;
  readonly controller: AbortController;
  readonly shellcheck: ShellCheck;
}

/**
 * Hands each package instance one lint at a time, so that which lints run
 * next stays decided here: only the newest request per document, the active
 * editor's document first, and a running lint aborted as soon as it is stale.
 */
export class WasmRunner implements ShellCheckRunner {
  public readonly kind = "wasm";

  private readonly logger: Logger;
  /** Insertion ordered, so a re-typed document replaces its own pending run
   * without losing its place behind other documents. */
  private readonly pending = new Map<string, PendingRun>();
  private readonly running = new Set<RunningRun>();
  /** Instances whose worker, once started, is kept for the next lint. */
  private readonly idle: ShellCheck[] = [];
  private nextRunId = 0;
  private disposed = false;

  public constructor(private readonly options: WasmRunnerOptions) {
    this.logger = options.logger;
  }

  public run(request: LintRequest): Promise<LintResult> {
    if (this.disposed) {
      return Promise.reject(new RunnerDisposedError());
    }
    return new Promise<LintResult>((resolve, reject) => {
      const key = request.documentKey;
      this.pending.get(key)?.reject(new RunSupersededError());
      this.pending.set(key, { request, resolve, reject });
      for (const running of this.running) {
        if (running.documentKey === key) {
          // The package terminates the worker for this; nothing else stops a
          // wasm command mid-run.
          running.controller.abort(new RunSupersededError());
        }
      }
      this.pump();
    });
  }

  public cancel(documentKey: string): void {
    // A running lint is left to finish: aborting it costs a worker respawn,
    // and the linter discards the result of a closed document anyway.
    const run = this.pending.get(documentKey);
    if (run) {
      this.pending.delete(documentKey);
      run.reject(new RunSupersededError());
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const run of this.pending.values()) {
      run.reject(new RunnerDisposedError());
    }
    this.pending.clear();
    for (const running of this.running) {
      running.controller.abort(new RunnerDisposedError());
      this.shutDown(running.shellcheck);
    }
    this.idle.splice(0).forEach((shellcheck) => this.shutDown(shellcheck));
  }

  private shutDown(shellcheck: ShellCheck): void {
    shellcheck.dispose().catch((error: unknown) => {
      this.logger.error(
        "ShellCheck (wasm): the runtime could not be shut down: %s",
        detailOf(error),
      );
    });
  }

  private limit(): number {
    return this.options.maxConcurrentRuns() || DEFAULT_MAX_CONCURRENT_RUNS;
  }

  private nextDocumentKey(): string | undefined {
    const active = this.options.activeDocumentKey();
    if (active !== undefined && this.pending.has(active)) {
      return active;
    }
    return this.pending.keys().next().value;
  }

  private pump(): void {
    while (!this.disposed && this.running.size < this.limit()) {
      const documentKey = this.nextDocumentKey();
      if (documentKey === undefined) {
        return;
      }
      const run = this.pending.get(documentKey)!;
      this.pending.delete(documentKey);
      this.start(run, this.idle.pop() ?? this.options.createShellCheck());
    }
  }

  private start(run: PendingRun, shellcheck: ShellCheck): void {
    const { documentKey } = run.request;
    const id = ++this.nextRunId;
    const controller = new AbortController();
    const timeoutMs = run.request.timeoutMs || DEFAULT_RUN_TIMEOUT_MS;
    const watchdog = AbortSignal.timeout(timeoutMs);
    const running: RunningRun = { documentKey, controller, shellcheck };
    this.running.add(running);
    this.logger.debug(
      "ShellCheck (wasm): run %d started for %s",
      id,
      documentKey,
    );

    const { args, stdin, mount } = run.request;
    shellcheck
      .lint(
        {
          args,
          stdin,
          // PWD is what emulates the native working directory, and it must
          // name a directory the guest can see.
          env: mount ? { PWD: mount.pwd } : {},
          fs: mount?.fs,
        },
        { signal: AbortSignal.any([controller.signal, watchdog]) },
      )
      .then(
        (result) => this.settle(run, result),
        (error: unknown) => {
          run.reject(
            this.failureOf(error, watchdog, timeoutMs, id, run.request),
          );
        },
      )
      .finally(() => {
        this.running.delete(running);
        if (this.disposed) {
          // dispose() has shut this instance down already.
          return;
        }
        // Keeps no more workers than a lowered limit allows.
        if (this.running.size + this.idle.length < this.limit()) {
          this.idle.push(shellcheck);
        } else {
          this.shutDown(shellcheck);
        }
        this.pump();
      });
  }

  private settle(run: PendingRun, result: PackageLintResult): void {
    const { exitCode, stdout, stderr } = result;
    if (stdout.length === 0 && stderr.includes(CHDIR_FAILURE)) {
      run.reject(
        new WasmRuntimeError(
          "ShellCheck (wasm) could not enter the working directory",
          stderr,
        ),
      );
      return;
    }
    // 0 is a clean file and 1 is findings; anything else is a bad argument or
    // a host bug, and only stderr says which.
    if (exitCode !== 0 && exitCode !== 1) {
      this.logger.error(
        "ShellCheck (wasm) exited with %d: %s",
        exitCode,
        stderr.trim(),
      );
    }
    run.resolve({ stdout, stderr, exitCode });
  }

  private failureOf(
    error: unknown,
    watchdog: AbortSignal,
    timeoutMs: number,
    id: number,
    request: LintRequest,
  ): Error {
    if (
      error instanceof RunSupersededError ||
      error instanceof RunnerDisposedError ||
      error instanceof WasmRuntimeError
    ) {
      return error;
    }
    if (this.disposed) {
      return new RunnerDisposedError();
    }
    if (watchdog.aborted && error === watchdog.reason) {
      this.logger.error(
        "ShellCheck (wasm): run %d for %s exceeded %d ms, terminating the worker (args: %s)",
        id,
        request.documentKey,
        timeoutMs,
        request.args.join(" "),
      );
      return new RunTimeoutError(timeoutMs / 1000);
    }
    return new WasmRuntimeError(
      "The ShellCheck wasm runtime failed",
      detailOf(error),
    );
  }
}

export function detailOf(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
