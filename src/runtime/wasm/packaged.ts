import type { ShellCheck } from "@vscode-shellcheck/shellcheck-wasm/client";
import * as vscode from "vscode";
import * as platform from "../../platform/index.js";
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
    await import("@vscode-shellcheck/shellcheck-wasm/client");
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

  return createShellCheck({
    module,
    createWorker: () => platform.startWasmWorker(extensionUri, logger),
  });
}
