import { execa } from "execa";
import * as logging from "../utils/logging/index.js";
import {
  LintRequest,
  LintResult,
  NativeRunTimeoutError,
  ShellCheckRunner,
} from "./types.js";

export class NativeRunner implements ShellCheckRunner {
  public readonly kind = "native";

  public run(request: LintRequest): Promise<LintResult> {
    const { executablePath, args, cwd, timeoutMs = 0 } = request;

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

      let timer: NodeJS.Timeout | undefined;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          childProcess.kill();
          // A grandchild, say of a wrapper script, can survive the kill with
          // both pipes inherited, and execa only settles once they close:
          // release them, and settle now rather than wait for that.
          childProcess.stdout?.destroy();
          childProcess.stderr?.destroy();
          reject(new NativeRunTimeoutError(timeoutMs / 1000));
        }, timeoutMs);
      }

      childProcess.stderr?.on("data", (chunk: Buffer) => {
        stderr.push(chunk.toString());
      });

      childProcess.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk.toString());
      });

      // Exit 1 means findings, which execa rejects, so either outcome carries
      // the result; 2 or more is an error that only stderr explains.
      const settle = ({ exitCode }: { exitCode?: number }) => {
        clearTimeout(timer);
        if (exitCode !== undefined && exitCode >= 2) {
          logging.error(
            "ShellCheck exited with %d: %s",
            exitCode,
            stderr.join("").trim(),
          );
        }
        resolve({
          stdout: stdout.join(""),
          stderr: stderr.join(""),
          exitCode: exitCode ?? null,
        });
      };
      childProcess.then(settle, settle);

      childProcess.nodeChildProcess.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
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
