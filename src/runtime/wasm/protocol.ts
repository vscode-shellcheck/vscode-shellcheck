/**
 * The wire format between `wasm-runner.ts` on the main thread and `worker.ts`.
 * Types only: importing this module must never pull the WASI host, and with it
 * `@bjorn3/browser_wasi_shim`, into the extension bundle.
 */

export interface RunPreopen {
  /** Path the guest sees the directory at, always "/". */
  readonly guestName: string;
  /** Host directory to expose, read-only. */
  readonly hostRoot: string;
}

/**
 * `source: "module"` carries the Module compiled once on the main thread;
 * the worker stores it as is. `source: "bytes"` is the fallback for a host
 * that refuses to structured-clone a Module, where the worker compiles.
 */
export type InitMessage =
  | {
      readonly type: "init";
      readonly source: "module";
      readonly module: WebAssembly.Module;
    }
  | {
      readonly type: "init";
      readonly source: "bytes";
      readonly bytes: Uint8Array<ArrayBuffer>;
    };

export interface RunMessage {
  readonly type: "run";
  /** Identifies the reply; a reply for any other id is stale and dropped. */
  readonly id: number;
  /** argv without argv[0], which the WASI host supplies. */
  readonly args: readonly string[];
  /** `PWD` here is what emulates the native working directory. */
  readonly env: Readonly<Record<string, string>>;
  /** Document text, transferred rather than copied. */
  readonly stdin: Uint8Array<ArrayBuffer>;
  /** Absent means the guest runs with no filesystem at all. */
  readonly preopen?: RunPreopen;
}

export type MainToWorker = InitMessage | RunMessage;

export interface ReadyMessage {
  readonly type: "ready";
  /** Echoes how `init` was satisfied, so the main thread can log a fallback. */
  readonly moduleSource: "module" | "bytes";
}

export interface ResultMessage {
  readonly type: "result";
  readonly id: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface FailedMessage {
  readonly type: "failed";
  /** null when the failure is not tied to a run, i.e. `init` failed. */
  readonly id: number | null;
  readonly message: string;
  readonly detail: string;
}

export type WorkerToMain = ReadyMessage | ResultMessage | FailedMessage;
