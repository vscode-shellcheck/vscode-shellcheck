import type {
  ShellCheck,
  WorkerPort,
} from "@vscode-shellcheck/shellcheck-wasm";
import { Worker } from "node:worker_threads";
import * as vscode from "vscode";
import { Logger } from "../../utils/logging/types.js";
import { WasmRuntimeError } from "../types.js";
import { detailOf } from "./wasm-runner.js";

/** Where the package's module is shipped, relative to the extension root. */
export const PACKAGED_WASM_PATH =
  "node_modules/@vscode-shellcheck/shellcheck-wasm/dist/shellcheck.wasm";

/** Read through `workspace.fs` like every other file on the wasm path. */
export async function compilePackagedModule(
  extensionUri: vscode.Uri,
): Promise<WebAssembly.Module> {
  const bytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(extensionUri, PACKAGED_WASM_PATH),
  );
  // Typed loosely by @types/vscode; never backed by a SharedArrayBuffer.
  return await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>);
}

function startWorker(workerPath: string, logger: Logger): WorkerPort {
  const worker = new Worker(workerPath);
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

export interface PackagedShellCheckOptions {
  readonly extensionUri: vscode.Uri;
  readonly logger: Logger;
  /** Defaults to the packaged module; tests count how often it is loaded. */
  loadModule?(): Promise<WebAssembly.Module>;
}

/**
 * The package's runner over the bundled worker entry, `dist/wasm-worker.js`.
 * The module is compiled once, here, and the package hands that same Module to
 * every worker it starts, so a respawn never compiles it again.
 */
export async function createPackagedShellCheck(
  options: PackagedShellCheckOptions,
): Promise<ShellCheck> {
  // Imported on demand: esbuild hoists a static import of an external package
  // to the top of the extension bundle, where every native session would
  // evaluate it at activation.
  const { createShellCheck } =
    await import("@vscode-shellcheck/shellcheck-wasm");
  const { extensionUri, logger } = options;
  const module = (
    options.loadModule?.() ?? compilePackagedModule(extensionUri)
  ).catch((error: unknown) => {
    throw new WasmRuntimeError(
      "The bundled ShellCheck wasm module could not be loaded",
      detailOf(error),
    );
  });
  // Surfaces on the first lint instead, which awaits it; unobserved until then.
  module.catch(() => undefined);

  const workerPath = vscode.Uri.joinPath(
    extensionUri,
    "dist",
    "wasm-worker.js",
  ).fsPath;
  return createShellCheck({
    module,
    createWorker: () => startWorker(workerPath, logger),
  });
}
