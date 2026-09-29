import { execa } from "execa";
import * as logging from "../utils/logging/index.js";
import { LintRequest, LintResult, ShellCheckRunner } from "./types.js";

export class NativeRunner implements ShellCheckRunner {
  public readonly kind = "native";

  public run(request: LintRequest): Promise<LintResult> {
    const { executablePath, args, cwd, runId, documentKey } = request;

    return new Promise<LintResult>((resolve, reject) => {
      const childProcess = execa(executablePath, args, { cwd });
      logging.debug(
        "lint #%d spawn (native): %s %s (cwd=%s, pid=%s, document=%s)",
        runId,
        executablePath,
        args,
        cwd,
        childProcess.pid,
        documentKey,
      );

      if (!childProcess.pid || !childProcess.stdin || !childProcess.stdout) {
        // A spawn failure never emits "error" on the child process, it only
        // rejects the execa promise.
        childProcess.then(
          () => resolve({ stdout: "", stderr: "", exitCode: null }),
          reject,
        );
        return;
      }

      // shellcheck exits 1 whenever it reports a finding, which execa treats
      // as a failure. The result is read off stdout instead, so the promise is
      // settled here only to keep Node from reporting an unhandled rejection.
      childProcess.catch(() => undefined);

      childProcess.stdout.setEncoding("utf-8");
      childProcess.stdin.write(request.stdin);
      childProcess.stdin.end();

      const stdout: string[] = [];
      const stderr: string[] = [];

      childProcess.stderr?.on("data", (chunk: Buffer) => {
        stderr.push(chunk.toString());
      });

      childProcess.stdout
        .on("data", (chunk: Buffer) => {
          stdout.push(chunk.toString());
        })
        .on("end", () => {
          // Settling on end of stdout instead of on child exit: stderr is
          // whatever arrived by then and the exit code is not known yet.
          resolve({
            stdout: stdout.join(""),
            stderr: stderr.join(""),
            exitCode: null,
          });
        });

      childProcess.nodeChildProcess.on("error", reject);
      // The run settles on end of stdout, so only this tells how the process
      // itself ended.
      childProcess.nodeChildProcess.on("exit", (code, signal) => {
        logging.debug(
          "lint #%d exit (native): code=%s, signal=%s",
          runId,
          code,
          signal,
        );
      });
    });
  }

  public cancel(): void {
    // Nothing is queued: the native path spawns every run at once.
  }

  public dispose(): void {
    // An in-flight child is left to finish: the native path has no cancellation.
  }
}
