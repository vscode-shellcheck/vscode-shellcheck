import { execa } from "execa";
import * as logging from "../utils/logging/index.js";
import { LintRequest, LintResult, ShellCheckRunner } from "./types.js";

export class NativeRunner implements ShellCheckRunner {
  public readonly kind = "native";

  public run(request: LintRequest): Promise<LintResult> {
    const { executablePath, args, cwd } = request;

    return new Promise<LintResult>((resolve, reject) => {
      logging.debug("Spawn: (cwd=%s) %s %s", cwd, executablePath, args);
      const childProcess = execa(executablePath, args, { cwd });

      if (!childProcess.pid || !childProcess.stdin || !childProcess.stdout) {
        // A spawn failure never emits "error" on the child process, it only
        // rejects the execa promise.
        childProcess.then(
          () => resolve({ stdout: "", stderr: "", exitCode: null }),
          reject,
        );
        return;
      }

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
    });
  }

  public dispose(): void {
    // An in-flight child is left to finish: the native path has no cancellation.
  }
}
