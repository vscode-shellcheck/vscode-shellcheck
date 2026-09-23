import type {
  LintResult as PackageLintResult,
  ShellCheck,
} from "@vscode-shellcheck/shellcheck-wasm";
import { Logger } from "../../utils/logging/types.js";
import {
  LintRequest,
  LintResult,
  RunSupersededError,
  RunnerDisposedError,
  ShellCheckRunner,
  WasmRuntimeError,
} from "../types.js";

/** Watchdog budget for a single lint, deliberately not a setting. */
export const DEFAULT_RUN_TIMEOUT_MS = 30_000;

/**
 * The GHC runtime cannot enter `PWD` and gives up before ShellCheck runs,
 * leaving stdout empty. Indistinguishable from a clean file at the parse
 * layer, so it has to be caught here.
 */
const CHDIR_FAILURE = "hs_init_ghc";

export interface WasmRunnerOptions {
  readonly shellcheck: ShellCheck;
  readonly logger: Logger;
  /** Key of the document the user is looking at, whose lint goes first. */
  activeDocumentKey(): string | undefined;
  readonly runTimeoutMs?: number;
}

interface PendingRun {
  readonly request: LintRequest;
  readonly resolve: (result: LintResult) => void;
  readonly reject: (error: Error) => void;
}

interface RunningRun {
  readonly documentKey: string;
  readonly controller: AbortController;
}

/**
 * Feeds the package one lint at a time, so that which lint runs next stays
 * decided here: only the newest request per document, the active editor's
 * document first, and a running lint aborted as soon as it is stale.
 */
export class WasmRunner implements ShellCheckRunner {
  public readonly kind = "wasm";

  private readonly shellcheck: ShellCheck;
  private readonly logger: Logger;
  private readonly runTimeoutMs: number;
  /** Insertion ordered, so a re-typed document replaces its own pending run
   * without losing its place behind other documents. */
  private readonly pending = new Map<string, PendingRun>();
  private running: RunningRun | undefined;
  private nextRunId = 0;
  private disposed = false;

  public constructor(private readonly options: WasmRunnerOptions) {
    this.shellcheck = options.shellcheck;
    this.logger = options.logger;
    this.runTimeoutMs = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  }

  public run(request: LintRequest): Promise<LintResult> {
    if (this.disposed) {
      return Promise.reject(new RunnerDisposedError());
    }
    return new Promise<LintResult>((resolve, reject) => {
      const key = request.documentKey;
      this.pending.get(key)?.reject(new RunSupersededError());
      this.pending.set(key, { request, resolve, reject });
      if (this.running?.documentKey === key) {
        // The package terminates the worker for this; nothing else stops a
        // wasm command mid-run.
        this.running.controller.abort(new RunSupersededError());
      }
      this.pump();
    });
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
    this.running?.controller.abort(new RunnerDisposedError());
    this.shellcheck.dispose().catch((error: unknown) => {
      this.logger.error(
        "ShellCheck (wasm): the runtime could not be shut down: %s",
        detailOf(error),
      );
    });
  }

  private nextDocumentKey(): string | undefined {
    const active = this.options.activeDocumentKey();
    if (active !== undefined && this.pending.has(active)) {
      return active;
    }
    return this.pending.keys().next().value;
  }

  private pump(): void {
    if (this.running || this.disposed) {
      return;
    }
    const documentKey = this.nextDocumentKey();
    if (documentKey === undefined) {
      return;
    }
    const run = this.pending.get(documentKey)!;
    this.pending.delete(documentKey);

    const id = ++this.nextRunId;
    const controller = new AbortController();
    const watchdog = AbortSignal.timeout(this.runTimeoutMs);
    this.running = { documentKey, controller };
    this.logger.debug(
      "ShellCheck (wasm): run %d started for %s",
      id,
      documentKey,
    );

    const { args, stdin, mount } = run.request;
    this.shellcheck
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
          run.reject(this.failureOf(error, watchdog, id, run.request));
        },
      )
      .finally(() => {
        if (this.running?.controller === controller) {
          this.running = undefined;
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
        this.runTimeoutMs,
        request.args.join(" "),
      );
      return new WasmRuntimeError(
        `ShellCheck (wasm) timed out after ${this.runTimeoutMs} ms`,
        request.documentKey,
      );
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
