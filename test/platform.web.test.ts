import assert from "node:assert";
import {
  assertWasmHostSupported,
  formatLogMessage,
} from "../src/platform/index.web.js";
import { WasmRuntimeError } from "../src/runtime/types.js";

suite("Web platform", () => {
  test("formats log placeholders like util.format", () => {
    const error = new Error("broken");
    error.stack = "Error: broken\n    at fixture";
    assert.strictEqual(
      formatLogMessage("%s ran %d times: %O %%", "lint", 2, error, { a: 1 }),
      'lint ran 2 times: Error: broken\n    at fixture % {"a":1}',
    );
  });

  test("refuses a host that is not cross-origin isolated", () => {
    // The desktop extension host is not a cross-origin isolated page either.
    assert.strictEqual(globalThis.crossOriginIsolated, undefined);
    assert.throws(() => assertWasmHostSupported(), WasmRuntimeError);
  });
});
