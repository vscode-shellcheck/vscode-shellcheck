import assert from "node:assert";
import * as vscode from "vscode";
import { shellDialectForUri } from "../src/utils/shell-dialect.js";

suite("Shell dialect", () => {
  test("uses the URI path for a Windows file URI", () => {
    assert.strictEqual(
      shellDialectForUri(
        vscode.Uri.parse("file:///C:/Users/example/scripts/check.bash"),
      ),
      "bash",
    );
  });

  test("uses the URI path for a virtual file", () => {
    assert.strictEqual(
      shellDialectForUri(
        vscode.Uri.parse("vscode-vfs://github/project/scripts/check.dash"),
      ),
      "dash",
    );
  });
});
