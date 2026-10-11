import assert from "node:assert";
import * as vscode from "vscode";
import { getRuntimeKind } from "../src/settings.js";

function section(runtime: unknown): vscode.WorkspaceConfiguration {
  return {
    get: (key: string) => (key === "runtime" ? runtime : undefined),
  } as vscode.WorkspaceConfiguration;
}

suite("Runtime setting on desktop", () => {
  test("auto and an unset value run the native program", () => {
    assert.strictEqual(getRuntimeKind(section("auto")), "native");
    assert.strictEqual(getRuntimeKind(section(undefined)), "native");
  });

  test("an explicit runtime is used as is", () => {
    assert.strictEqual(getRuntimeKind(section("native")), "native");
    assert.strictEqual(getRuntimeKind(section("wasm")), "wasm");
  });

  test("defaults to auto", () => {
    assert.strictEqual(
      vscode.workspace.getConfiguration("shellcheck").inspect("runtime")
        ?.defaultValue,
      "auto",
    );
  });
});
