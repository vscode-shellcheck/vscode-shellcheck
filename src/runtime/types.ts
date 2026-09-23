import type { ShellCheckFileSystem } from "@vscode-shellcheck/shellcheck-wasm";

/** What a sandboxed runtime lets ShellCheck read, and where it runs inside it. */
export interface LintMount {
  /** Mounted read-only at guest `/`. */
  readonly fs: ShellCheckFileSystem;
  /** Guest path of the working directory, handed to the guest as `PWD`. */
  readonly pwd: string;
}

/** Everything the linter has already computed; no vscode types cross this line. */
export interface LintRequest {
  /** Dedupe/cancellation key. Always `textDocument.uri.toString()`. */
  readonly documentKey: string;
  /** Path of the shellcheck executable to run. */
  readonly executablePath: string;
  /** Fully built argv, excluding argv[0]. Always ends with "-". */
  readonly args: readonly string[];
  /** Document text, exactly `textDocument.getText()`. */
  readonly stdin: string;
  /** Working directory, already validated to exist, or undefined. */
  readonly cwd: string | undefined;
  /**
   * Files a sandboxed runtime may read. Undefined means stdin only. The native
   * runtime, which has the whole local filesystem, ignores it.
   */
  readonly mount?: LintMount;
}

export interface LintResult {
  readonly stdout: string;
  readonly stderr: string;
  /** null when the runtime does not report one. */
  readonly exitCode: number | null;
}

export type RuntimeKind = "native" | "wasm";

export interface ShellCheckRunner {
  readonly kind: RuntimeKind;
  run(request: LintRequest): Promise<LintResult>;
  /** Idempotent. */
  dispose(): void;
}

/** A run dropped because its runner was disposed. Never surfaced to the user. */
export class RunnerDisposedError extends Error {
  public constructor(message = "The ShellCheck runtime was disposed") {
    super(message);
    this.name = "RunnerDisposedError";
  }
}

/** A run dropped in favour of a newer one for the same document. Never surfaced. */
export class RunSupersededError extends Error {
  public constructor(
    message = "Superseded by a newer request for this document",
  ) {
    super(message);
    this.name = "RunSupersededError";
  }
}

/** The wasm runtime itself failed: load, trap, unexpected exit or watchdog. */
export class WasmRuntimeError extends Error {
  public constructor(
    message: string,
    /** stderr, a stack or whatever else belongs in the output channel only. */
    public readonly detail: string = "",
  ) {
    super(message);
    this.name = "WasmRuntimeError";
  }
}
