import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  waitForDiagnostics,
} from "./helpers.js";

for (const runtime of RUNTIMES) {
  suite(`Shellcheck extension (${runtime} runtime)`, () => {
    suiteSetup(async () => {
      await setRuntime(runtime);
    });

    suiteTeardown(async () => {
      await resetRuntime();
    });

    teardown(async () => {
      await closeAllEditors();
    });

    test("Extension should be activated on shell script files", async () => {
      const ext = vscode.extensions.getExtension("timonwong.shellcheck")!;
      const document = await openDocument("#!/bin/bash\nx=1", "shellscript");
      const diagnostics = await waitForDiagnostics(document, 5000, (items) =>
        items.some(
          (diagnostic) =>
            typeof diagnostic.code === "object" &&
            diagnostic.code.value === "SC2034",
        ),
      );

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
      const diagnostics = await waitForDiagnostics(document, 5000, (items) =>
        items.some(
          (diagnostic) =>
            typeof diagnostic.code === "object" &&
            diagnostic.code.value === "SC2034",
        ),
      );

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
}

suite("Shellcheck extension (wasm runtime, closed documents)", function () {
  // The wasm runtime lints one document at a time, and the first document is
  // deliberately slow so that the closed one is still waiting behind it.
  this.timeout(60000);

  suiteSetup(async () => {
    await setRuntime("wasm");
  });

  suiteTeardown(async () => {
    await resetRuntime();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test("a document closed before its lint completes keeps no diagnostics", async () => {
    await openDocument(
      `#!/bin/bash\n${"foo=$(ls); echo $foo\n".repeat(1000)}`,
      "shellscript",
    );
    const closed = await openDocument("#!/bin/bash\nx=1", "shellscript");
    const gone = new Promise<void>((resolve) => {
      const disposable = vscode.workspace.onDidCloseTextDocument((document) => {
        if (document === closed) {
          disposable.dispose();
          resolve();
        }
      });
    });
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor",
    );
    await gone;

    // Not shown, so it is not the active editor's and is linted strictly
    // after the closed document: once it has diagnostics, the runner has
    // been through the closed document too.
    const last = await vscode.workspace.openTextDocument({
      language: "shellscript",
      content: "#!/bin/bash\ny=1",
    });
    await waitForDiagnostics(last, 55000);

    assert.deepStrictEqual(vscode.languages.getDiagnostics(closed.uri), []);
  });
});
