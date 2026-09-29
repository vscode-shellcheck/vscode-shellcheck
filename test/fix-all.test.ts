import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  waitForDiagnostics,
  waitForText,
} from "./helpers.js";

for (const runtime of RUNTIMES) {
  suite(`Fix all (${runtime} runtime)`, () => {
    suiteSetup(async () => {
      await setRuntime(runtime);
    });

    suiteTeardown(async () => {
      await resetRuntime();
    });

    teardown(async () => {
      await closeAllEditors();
    });

    test("Extension should fix issues automatically on demand", async function () {
      const document = await openDocument(
        `#!/bin/bash
echo $SHELL
echo $SHELL
eval \`uname -r\`
`,
        "shellscript",
      );
      await waitForDiagnostics(document);

      const textPromise = waitForText(document);
      await vscode.commands.executeCommand("editor.action.fixAll");
      const text = await textPromise;

      assert.strictEqual(
        text,
        `#!/bin/bash
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`,
      );
    })
      // TODO: fix the flakiness and remove this
      .retries(3);

    test("Extension should fix only one issue in a same range", async function () {
      const document = await openDocument(
        `#!/bin/bash
# shellcheck enable=require-variable-braces
echo $SHELL
echo $SHELL
eval \`uname -r\`
`,
        "shellscript",
      );
      await waitForDiagnostics(document);

      const textPromise = waitForText(document);
      await vscode.commands.executeCommand("editor.action.fixAll");
      const text = await textPromise;

      assert.strictEqual(
        text,
        `#!/bin/bash
# shellcheck enable=require-variable-braces
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`,
      );
    });
  });
}
