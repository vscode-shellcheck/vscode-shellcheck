import type * as NodePlatform from "./index.js";
import * as vscode from "vscode";
import { WorkerPort } from "@vscode-shellcheck/shellcheck-wasm/client";
import { Logger } from "../utils/logging/types.js";
import { WasmRuntimeError } from "../runtime/types.js";

export const isWeb: boolean = true;

function stringify(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[Circular]";
  }
}

export function formatLogMessage(format: string, ...args: unknown[]): string {
  let index = 0;
  const formatted = format.replace(/%[sdifjoO%]/g, (token) => {
    if (token === "%%") return "%";
    if (index >= args.length) return token;
    const value = args[index++];
    if (value instanceof Error) return value.stack ?? value.message;
    switch (token) {
      case "%s":
        return String(value);
      case "%d":
      case "%f":
        return String(Number(value));
      case "%i":
        return String(Number.parseInt(String(value), 10));
      case "%j":
      case "%o":
      case "%O":
        return stringify(value);
      default:
        return token;
    }
  });
  return `${formatted}${args
    .slice(index)
    .map(
      (value) =>
        ` ${value !== null && typeof value === "object" ? stringify(value) : String(value)}`,
    )
    .join("")}`;
}

export async function resolveExecutable(
  _context: vscode.ExtensionContext,
  _configuredPath: string | undefined,
): Promise<{ path: string; bundled: boolean }> {
  return { path: "", bundled: false };
}

export function getToolVersion(_path: string): Promise<never> {
  return Promise.reject(
    new Error("Native ShellCheck is unavailable on the Web"),
  );
}

export function tryPromptForUpdatingTool(_version: unknown): void {}

export function createNativeRunner(): never {
  throw new Error("The native ShellCheck runtime is unavailable on the Web");
}

export function homeDirectory(): undefined {
  return undefined;
}

export function fixDriveCasingInWindows(pathToFix: string): string {
  return pathToFix;
}

export function guessDocumentDirname(
  _textDocument: vscode.TextDocument,
): undefined {
  return undefined;
}

export function ensureCurrentWorkingDirectory(
  _cwd: string | undefined,
): Promise<undefined> {
  return Promise.resolve(undefined);
}

export function nativeWorkingDirectory(
  _textDocument: vscode.TextDocument,
  _useWorkspaceRootAsCwd: boolean,
): Promise<undefined> {
  return Promise.resolve(undefined);
}

export function startWasmWorker(
  extensionUri: vscode.Uri,
  _logger: Logger,
): WorkerPort {
  const worker = new Worker(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules/@vscode-shellcheck/shellcheck-wasm/dist/browser/worker.js",
    ).toString(true),
  );
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (listener) =>
      worker.addEventListener("message", (event) => listener(event.data)),
    onError: (listener) =>
      worker.addEventListener("error", (event) =>
        listener(event.message ?? event),
      ),
    terminate: () => worker.terminate(),
  };
}

export function assertWasmHostSupported(): void {
  if (globalThis.crossOriginIsolated !== true) {
    throw new WasmRuntimeError(
      "ShellCheck needs a cross-origin isolated VS Code for the Web: SharedArrayBuffer is unavailable",
    );
  }
}

// Keep this assignment intentionally broad: adding or removing a platform
// export requires both implementations to be updated together.
const platformSurfaceCheck: typeof NodePlatform = {
  isWeb,
  formatLogMessage,
  resolveExecutable,
  getToolVersion,
  tryPromptForUpdatingTool,
  createNativeRunner,
  homeDirectory,
  fixDriveCasingInWindows,
  guessDocumentDirname,
  ensureCurrentWorkingDirectory,
  nativeWorkingDirectory,
  startWasmWorker,
  assertWasmHostSupported,
};
Object.freeze(platformSurfaceCheck);
