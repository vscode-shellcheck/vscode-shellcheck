import {
  isArtifactSupported,
  type WorkerPort,
} from "@vscode-shellcheck/shellcheck-wasm/client";
import * as vscode from "vscode";
import { WasmRuntimeError } from "../runtime/types.js";
import { Logger } from "../utils/logging/types.js";

type Same<A, B> = [A, B] extends [B, A] ? true : false;
type Assert<T extends true> = T;
// The web build swaps this module in for ./index.js, so tsc must reject any
// difference between what the two export.
export type ExportsMatchNode = Assert<
  Same<typeof import("./index.js"), typeof import("./index.web.js")>
>;

export const isWindows: boolean = false;

export const homeDirectory: string | undefined = undefined;

function show(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** `util.format` for the placeholders the extension logs with. */
export function formatLogMessage(format: string, ...args: unknown[]): string {
  const text = format.replace(/%[a-zA-Z%]/g, (token) =>
    token === "%%" ? "%" : args.length ? show(args.shift()) : token,
  );
  return [text, ...args.map(show)].join(" ");
}

/**
 * Browsers only provide SharedArrayBuffer, which the package's bridge needs, to
 * a cross-origin isolated page, and older ones cannot compile the module.
 */
export function assertWasmHostSupported(): void {
  if (!globalThis.crossOriginIsolated) {
    throw new WasmRuntimeError(
      "ShellCheck needs a cross-origin isolated VS Code for the Web: SharedArrayBuffer is unavailable",
    );
  }
  if (!isArtifactSupported()) {
    throw new WasmRuntimeError(
      "ShellCheck needs a browser with WebAssembly tail calls: Chrome or Edge 112, Firefox 121 or Safari 18.2 and later",
    );
  }
}

/** The package's prebuilt worker, which stays a file of its own: it is GPL. */
export function startWasmWorker(
  extensionUri: vscode.Uri,
  logger: Logger,
): WorkerPort {
  const worker = new Worker(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules/@vscode-shellcheck/shellcheck-wasm/dist/browser/worker.js",
    ).toString(true),
  );
  logger.debug("ShellCheck (wasm): worker started");
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (listener) =>
      worker.addEventListener("message", (event) => listener(event.data)),
    onError: (listener) =>
      worker.addEventListener("error", (event) =>
        // A script that fails to load fires a plain Event, not an ErrorEvent.
        listener(event instanceof ErrorEvent ? event.message : "load failed"),
      ),
    terminate: () => {
      worker.terminate();
      logger.debug("ShellCheck (wasm): worker terminated");
    },
  };
}
