import fs from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { Logger } from "../../utils/logging/types.js";
import {
  LintRequest,
  LintResult,
  RunSupersededError,
  RunnerDisposedError,
  ShellCheckRunner,
  WasmRuntimeError,
} from "../types.js";
import { resolveMapping } from "./guest-path.js";
import type {
  InitMessage,
  ResultMessage,
  RunMessage,
  WorkerToMain,
} from "./protocol.js";

/** Watchdog budget for a single lint, deliberately not a setting. */
export const DEFAULT_RUN_TIMEOUT_MS = 30_000;

/** The preopen is always the guest's root; `PWD` navigates below it. */
const GUEST_ROOT = "/";

/**
 * The GHC runtime cannot enter `PWD` and gives up before ShellCheck runs,
 * leaving stdout empty. Indistinguishable from a clean file at the parse
 * layer, so it has to be caught here.
 */
const CHDIR_FAILURE = "hs_init_ghc";

export interface WasmModuleSource {
  /** Compiled on the main thread and posted to every worker it spawns. */
  readonly module: WebAssembly.Module;
  /**
   * Read on demand instead of retained: the 7.6 MiB source is only needed by
   * hosts that refuse to structured-clone a Module, which none is known to.
   */
  readBytes(): Promise<Uint8Array<ArrayBuffer>>;
}

export interface WasmRunnerOptions {
  /** Absolute path of the bundled worker entry, `dist/wasm-worker.js`. */
  readonly workerPath: string;
  /** Called once per runner; the result outlives every worker respawn. */
  loadModule(): Promise<WasmModuleSource>;
  readonly logger: Logger;
  readonly runTimeoutMs?: number;
}

/** Reads and compiles the bundled module; the caller resolves the path. */
export async function compileWasmFile(
  wasmPath: string,
): Promise<WasmModuleSource> {
  const readBytes = async (): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await fs.readFile(wasmPath));
  return { module: await WebAssembly.compile(await readBytes()), readBytes };
}

type RunnerState =
  "starting" | "idle" | "running" | "terminating" | "failed" | "disposed";

interface QueuedRun {
  readonly request: LintRequest;
  readonly resolve: (result: LintResult) => void;
  readonly reject: (error: Error) => void;
}

interface InFlightRun extends QueuedRun {
  readonly id: number;
  readonly documentKey: string;
  readonly timer: NodeJS.Timeout;
}

/**
 * Runs ShellCheck in one long-lived worker thread: one lint at a time, the
 * newest request per document only, and cancellation by killing the worker,
 * which is the only way to stop a wasm command mid-run.
 */
export class WasmRunner implements ShellCheckRunner {
  public readonly kind = "wasm";

  private readonly logger: Logger;
  private readonly runTimeoutMs: number;
  private state: RunnerState = "starting";
  private source: WasmModuleSource | undefined;
  private worker: Worker | undefined;
  private inFlight: InFlightRun | undefined;
  /** Keyed by document so a re-typed document replaces its own pending run
   * without losing its place behind other documents. */
  private readonly queue = new Map<string, QueuedRun>();
  private nextRunId = 0;
  private failure: WasmRuntimeError | undefined;
  private postBytes = false;

  public constructor(private readonly options: WasmRunnerOptions) {
    this.logger = options.logger;
    this.runTimeoutMs = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    this.track(this.start());
  }

  public run(request: LintRequest): Promise<LintResult> {
    return new Promise<LintResult>((resolve, reject) => {
      if (this.state === "disposed") {
        reject(new RunnerDisposedError());
        return;
      }
      if (this.state === "failed") {
        reject(
          this.failure ?? new WasmRuntimeError("ShellCheck (wasm) failed"),
        );
        return;
      }

      this.queue.get(request.documentKey)?.reject(new RunSupersededError());
      this.queue.set(request.documentKey, { request, resolve, reject });

      if (this.inFlight?.documentKey === request.documentKey) {
        this.track(this.cancelInFlight(new RunSupersededError()));
        return;
      }
      this.pump();
    });
  }

  public dispose(): void {
    if (this.state === "disposed") {
      return;
    }
    this.state = "disposed";
    this.source = undefined;
    const worker = this.worker;
    this.worker = undefined;
    this.rejectAll(new RunnerDisposedError());
    this.track(this.terminate(worker));
  }

  /** Fire-and-forget: every lifecycle step reports its own failures. */
  private track(work: Promise<void>): void {
    work.catch((error: unknown) => {
      this.fail(
        new WasmRuntimeError(
          "The ShellCheck wasm worker could not be managed",
          detailOf(error),
        ),
      );
    });
  }

  private stopped(): boolean {
    return this.state === "disposed" || this.state === "failed";
  }

  private async start(): Promise<void> {
    try {
      this.source = await this.options.loadModule();
    } catch (error) {
      this.fail(
        new WasmRuntimeError(
          "The bundled ShellCheck wasm module could not be loaded",
          detailOf(error),
        ),
      );
      return;
    }
    await this.spawnWorker();
  }

  private async spawnWorker(): Promise<void> {
    const source = this.source;
    if (!source || this.stopped()) {
      return;
    }

    let message: InitMessage;
    try {
      message = this.postBytes
        ? { type: "init", source: "bytes", bytes: await source.readBytes() }
        : { type: "init", source: "module", module: source.module };
    } catch (error) {
      this.fail(
        new WasmRuntimeError(
          "The bundled ShellCheck wasm module could not be read",
          detailOf(error),
        ),
      );
      return;
    }
    // Re-checked: disposal can land while the bytes are being read.
    if (this.stopped()) {
      return;
    }

    const worker = new Worker(this.options.workerPath);
    this.worker = worker;
    worker.on("message", (reply: WorkerToMain) =>
      this.onMessage(worker, reply),
    );
    worker.on("error", (error: Error) => this.onError(worker, error));
    worker.on("exit", (code: number) => this.onExit(worker, code));

    try {
      worker.postMessage(message);
    } catch (error) {
      if (message.source === "module" && isDataCloneError(error)) {
        this.logger.warn(
          "ShellCheck (wasm): this host cannot transfer a compiled module, falling back to compiling in the worker",
        );
        this.postBytes = true;
        this.worker = undefined;
        await this.terminate(worker);
        await this.spawnWorker();
        return;
      }
      this.fail(
        new WasmRuntimeError(
          "The ShellCheck wasm worker could not be initialized",
          detailOf(error),
        ),
      );
      return;
    }
    this.logger.debug("ShellCheck (wasm): worker %d started", worker.threadId);
  }

  private onMessage(worker: Worker, message: WorkerToMain): void {
    // A worker this runner has already replaced still delivers whatever it
    // posted before it died.
    if (this.worker !== worker) {
      return;
    }

    switch (message.type) {
      case "ready":
        this.logger.debug(
          "ShellCheck (wasm): worker %d ready (module source: %s)",
          worker.threadId,
          message.moduleSource,
        );
        if (this.state === "starting" || this.state === "terminating") {
          this.state = "idle";
          this.pump();
        }
        return;
      case "result": {
        const run = this.takeInFlight(message.id);
        if (run) {
          this.state = "idle";
          this.settle(run, message);
          this.pump();
        }
        return;
      }
      case "failed": {
        if (message.id === null) {
          this.fail(new WasmRuntimeError(message.message, message.detail));
          return;
        }
        const run = this.takeInFlight(message.id);
        if (run) {
          this.state = "idle";
          run.reject(new WasmRuntimeError(message.message, message.detail));
          this.pump();
        }
      }
    }
  }

  private onError(worker: Worker, error: Error): void {
    if (this.worker !== worker) {
      return;
    }
    this.fail(
      new WasmRuntimeError(
        "The ShellCheck wasm worker failed",
        detailOf(error),
      ),
    );
  }

  private onExit(worker: Worker, code: number): void {
    if (this.worker !== worker) {
      return;
    }
    // Not respawned on purpose: a fault in the guest can take the whole
    // extension host with it, so an automatic respawn risks a crash loop.
    this.fail(
      new WasmRuntimeError(
        `The ShellCheck wasm worker exited unexpectedly with code ${code}`,
      ),
    );
  }

  private pump(): void {
    const worker = this.worker;
    if (this.state !== "idle" || !worker) {
      return;
    }
    const next = this.queue.entries().next();
    if (next.done) {
      return;
    }
    const [documentKey, queued] = next.value;
    this.queue.delete(documentKey);

    const id = ++this.nextRunId;
    let message: RunMessage;
    try {
      message = toRunMessage(id, queued.request);
    } catch (error) {
      queued.reject(
        new WasmRuntimeError(
          "ShellCheck (wasm) could not map the document into the sandbox",
          detailOf(error),
        ),
      );
      this.pump();
      return;
    }

    const timer = setTimeout(() => this.onWatchdog(id), this.runTimeoutMs);
    // The worker keeps the event loop alive while it matters.
    timer.unref();
    this.inFlight = { ...queued, id, documentKey, timer };
    this.state = "running";
    this.logger.debug(
      "ShellCheck (wasm): run %d started for %s",
      id,
      documentKey,
    );
    worker.postMessage(message, [message.stdin.buffer]);
  }

  private settle(run: InFlightRun, message: ResultMessage): void {
    const { exitCode, stdout, stderr } = message;
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

  private onWatchdog(id: number): void {
    const run = this.inFlight;
    if (run?.id !== id) {
      return;
    }
    this.logger.error(
      "ShellCheck (wasm): run %d for %s exceeded %d ms, terminating the worker (args: %s)",
      id,
      run.documentKey,
      this.runTimeoutMs,
      run.request.args.join(" "),
    );
    this.track(
      this.cancelInFlight(
        new WasmRuntimeError(
          `ShellCheck (wasm) timed out after ${this.runTimeoutMs} ms`,
          run.documentKey,
        ),
      ),
    );
  }

  /** Killing the worker is the only way to stop a wasm command mid-run. */
  private async cancelInFlight(error: Error): Promise<void> {
    const run = this.inFlight;
    if (run) {
      clearTimeout(run.timer);
      this.inFlight = undefined;
      run.reject(error);
    }
    this.state = "terminating";

    // Dropped before the await so a request arriving meanwhile queues instead
    // of reaching a dying worker.
    const worker = this.worker;
    this.worker = undefined;
    await this.terminate(worker);

    if (this.state !== "terminating") {
      return;
    }
    await this.spawnWorker();
  }

  private async terminate(worker: Worker | undefined): Promise<void> {
    if (!worker) {
      return;
    }
    const threadId = worker.threadId;
    await worker.terminate();
    this.logger.debug("ShellCheck (wasm): worker %d terminated", threadId);
  }

  private takeInFlight(id: number): InFlightRun | undefined {
    const run = this.inFlight;
    if (run?.id !== id) {
      return undefined;
    }
    clearTimeout(run.timer);
    this.inFlight = undefined;
    return run;
  }

  private fail(error: WasmRuntimeError): void {
    if (this.stopped()) {
      return;
    }
    this.state = "failed";
    this.failure = error;
    this.logger.error(
      "ShellCheck (wasm) is unavailable: %s\n%s",
      error.message,
      error.detail,
    );
    const worker = this.worker;
    this.worker = undefined;
    this.rejectAll(error);
    this.track(this.terminate(worker));
  }

  private rejectAll(error: Error): void {
    const run = this.inFlight;
    if (run) {
      clearTimeout(run.timer);
      this.inFlight = undefined;
      run.reject(error);
    }
    for (const queued of this.queue.values()) {
      queued.reject(error);
    }
    this.queue.clear();
  }
}

function toRunMessage(id: number, request: LintRequest): RunMessage {
  const mapping = resolveMapping(request.preopenRoot, request.cwd);
  return {
    type: "run",
    id,
    args: [...request.args],
    // PWD is what emulates the native working directory; without a mapping the
    // guest gets neither a filesystem nor one.
    env: mapping ? { PWD: mapping.pwd } : {},
    stdin: new TextEncoder().encode(request.stdin),
    preopen: mapping
      ? { guestName: GUEST_ROOT, hostRoot: mapping.hostRoot }
      : undefined,
  };
}

function isDataCloneError(error: unknown): boolean {
  return error instanceof Error && error.name === "DataCloneError";
}

function detailOf(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
