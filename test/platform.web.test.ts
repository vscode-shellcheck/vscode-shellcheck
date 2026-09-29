/*
 * The web build can break if a Node module enters its graph, a GPL module is
 * bundled, import.meta survives in CommonJS, the worker URL is wrong, or the
 * host lacks cross-origin isolation. The first three are covered by esbuild
 * guards and bundle assertions; the worker and host conditions are tested here.
 */
import assert from "node:assert";
import * as vscode from "vscode";
import {
  assertWasmHostSupported,
  formatLogMessage,
  startWasmWorker,
} from "../src/platform/index.web.js";
import { WasmRuntimeError } from "../src/runtime/types.js";
import { Logger } from "../src/utils/logging/types.js";

const silentLogger: Logger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

suite("Web platform", () => {
  test("formats the supported log placeholders", () => {
    assert.strictEqual(
      formatLogMessage(
        "%s %d %i %f %j %o %O %%",
        "value",
        "4.5",
        "4.9",
        "4.5",
        { json: true },
        { compact: true },
        ["deep"],
      ),
      'value 4.5 4 4.5 {"json":true} {"compact":true} ["deep"] %',
    );
  });

  test("formats errors with their stack and appends unused values", () => {
    const error = new Error("broken");
    error.stack = "Error: broken\n    at fixture";
    assert.strictEqual(
      formatLogMessage("failed: %O", error, "after", { value: 1 }),
      'failed: Error: broken\n    at fixture after {"value":1}',
    );
  });

  test("rejects a host without cross-origin isolation", () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "crossOriginIsolated",
    );
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      configurable: true,
      value: false,
    });
    try {
      assert.throws(
        () => assertWasmHostSupported(),
        (error: unknown) =>
          error instanceof WasmRuntimeError &&
          error.message ===
            "ShellCheck needs a cross-origin isolated VS Code for the Web: SharedArrayBuffer is unavailable",
      );
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "crossOriginIsolated", original);
      } else {
        delete (globalThis as { crossOriginIsolated?: boolean })
          .crossOriginIsolated;
      }
    }
  });

  test("starts the packaged browser worker by extension URL", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    let constructedUrl: string | URL | undefined;
    let terminated = false;
    class FakeWorker {
      public constructor(url: string | URL) {
        constructedUrl = url;
      }

      public postMessage(): void {}
      public addEventListener(): void {}
      public terminate(): void {
        terminated = true;
      }
    }
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: FakeWorker,
    });
    try {
      const extensionUri = vscode.Uri.parse(
        "https://example.test/extensions/timonwong.shellcheck/",
      );
      const worker = startWasmWorker(extensionUri, silentLogger);
      assert.strictEqual(
        constructedUrl,
        "https://example.test/extensions/timonwong.shellcheck/node_modules/@vscode-shellcheck/shellcheck-wasm/dist/browser/worker.js",
      );
      await worker.terminate();
      assert.strictEqual(terminated, true);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "Worker", original);
      } else {
        delete (globalThis as { Worker?: typeof Worker }).Worker;
      }
    }
  });
});
