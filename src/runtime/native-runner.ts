import { execa } from "execa";
import * as logging from "../utils/logging/index.js";
import { Semaphore } from "../utils/semaphore.js";
import {
  LintRequest,
  LintResult,
  NativeRunTimeoutError,
  RunnerDisposedError,
  RunSupersededError,
  ShellCheckRunner,
} from "./types.js";

export class NativeRunner implements ShellCheckRunner {
  public readonly kind = "native";
  private readonly disposed = new AbortController();
  /** Runs waiting for a slot, by document key. */
  private readonly queued = new Map<string, AbortController>();

  public constructor(private readonly limiter: Semaphore) {}

  public run(request: LintRequest): Promise<LintResult> {
    const { documentKey } = request;
    const queued = new AbortController();
    this.queued.set(documentKey, queued);
    const dequeue = () => {
      if (this.queued.get(documentKey) === queued) {
        this.queued.delete(documentKey);
      }
    };
    return this.limiter
      .run(
        () => {
          dequeue();
          return this.spawn(request);
        },
        AbortSignal.any([this.disposed.signal, queued.signal]),
      )
      .finally(dequeue);
  }

  /** Runs once admitted, so the timeout never counts time spent queued. */
  private spawn(request: LintRequest): Promise<LintResult> {
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

  /** A run whose process already started is left to finish. */
  public cancel(documentKey: string): void {
    this.queued.get(documentKey)?.abort(new RunSupersededError());
  }

  public dispose(): void {
    // Rejects the queued runs; children already running are left to finish.
    this.disposed.abort(new RunnerDisposedError());
  }
}
