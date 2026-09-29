import os from "node:os";
import util from "node:util";
import { Worker } from "node:worker_threads";
import type { WorkerPort } from "@vscode-shellcheck/shellcheck-wasm/client";
import * as vscode from "vscode";
import { Logger } from "../utils/logging/types.js";

export const isWindows: boolean = process.platform === "win32";

export const homeDirectory: string | undefined = os.homedir();

export function formatLogMessage(format: string, ...args: unknown[]): string {
  return util.format(format, ...args);
}

/** Node and VS Code desktop always have SharedArrayBuffer. */
export function assertWasmHostSupported(): void {}

export function startWasmWorker(
  extensionUri: vscode.Uri,
  logger: Logger,
): WorkerPort {
  const worker = new Worker(
    vscode.Uri.joinPath(extensionUri, "dist", "wasm-worker.js").fsPath,
  );
  const threadId = worker.threadId;
  logger.debug("ShellCheck (wasm): worker %d started", threadId);
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (listener) => worker.on("message", listener),
    onError: (listener) => worker.on("error", listener),
    onExit: (listener) => worker.on("exit", listener),
    terminate: async () => {
      await worker.terminate();
      logger.debug("ShellCheck (wasm): worker %d terminated", threadId);
    },
  };
}
