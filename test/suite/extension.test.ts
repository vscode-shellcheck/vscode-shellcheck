//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from "node:assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { sleep } from "./utils";

suite("Shellcheck extension", () => {
  test("Extension should be activated on shell script files", async () => {
    const ext = <vscode.Extension<any>>(
      vscode.extensions.getExtension("timonwong.shellcheck")
    );
    const document = await vscode.workspace.openTextDocument({
      content: "#!/bin/bash\nx=1",
      language: "shellscript",
    });
    const editor = await vscode.window.showTextDocument(document);

    await sleep(3000);
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    assert.strictEqual(ext.isActive, true, "Extension should be activated");
    assert.strictEqual(diagnostics.length, 1);
    if (typeof diagnostics[0].code !== "object") {
      throw new Error("diagnostic.code should be an object");
    }
    assert.strictEqual(diagnostics[0].code?.value, "SC2034");
    assert.strictEqual(
      diagnostics[0].code?.target.toString(),
      "https://www.shellcheck.net/wiki/SC2034",
    );
  });
});
