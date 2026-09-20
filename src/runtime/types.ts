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
}

export interface LintResult {
  readonly stdout: string;
  readonly stderr: string;
  /** null when the runtime does not report one. */
  readonly exitCode: number | null;
}

export type RuntimeKind = "native";

export interface ShellCheckRunner {
  readonly kind: RuntimeKind;
  run(request: LintRequest): Promise<LintResult>;
  /** Idempotent. */
  dispose(): void;
}
