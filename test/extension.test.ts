import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  waitForDiagnostics,
} from "./helpers.js";

suite("Shellcheck extension", () => {
  teardown(async () => {
    await closeAllEditors();
  });

  test("Extension should be activated on shell script files", async () => {
    const ext = vscode.extensions.getExtension("timonwong.shellcheck")!;
    const document = await openDocument("#!/bin/bash\nx=1", "shellscript");
    const diagnostics = await waitForDiagnostics(document.uri);

    assert.strictEqual(ext.isActive, true, "Extension should be activated");
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(typeof diagnostics[0].code, "object");
    const code = diagnostics[0].code as {
      value: string;
      target: vscode.Uri;
    };
    assert.strictEqual(code.value, "SC2034");
    assert.strictEqual(
      code.target.toString(),
      "https://www.shellcheck.net/wiki/SC2034",
    );
  });

  test("Extension should be activated on bats files", async () => {
    const ext = vscode.extensions.getExtension("timonwong.shellcheck")!;
    const document = await openDocument("#!/usr/bin/env bats\nx=1", "bats");
    const diagnostics = await waitForDiagnostics(document.uri);

    assert.strictEqual(ext.isActive, true, "Extension should be activated");
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(typeof diagnostics[0].code, "object");
    const code = diagnostics[0].code as {
      value: string;
      target: vscode.Uri;
    };
    assert.strictEqual(code.value, "SC2034");
    assert.strictEqual(
      code.target.toString(),
      "https://www.shellcheck.net/wiki/SC2034",
    );
  });
});
