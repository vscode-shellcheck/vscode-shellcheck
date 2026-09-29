import assert from "node:assert";
import { selectRuntimeKind } from "../src/runtime/manager.js";

suite("Runtime manager", () => {
  test("forces wasm on the web even when native is configured", () => {
    assert.strictEqual(selectRuntimeKind("native", true), "wasm");
    assert.strictEqual(selectRuntimeKind(undefined, true), "wasm");
  });

  test("keeps the configured desktop runtime", () => {
    assert.strictEqual(selectRuntimeKind("wasm", false), "wasm");
    assert.strictEqual(selectRuntimeKind("native", false), "native");
    assert.strictEqual(selectRuntimeKind(undefined, false), "native");
  });
});
