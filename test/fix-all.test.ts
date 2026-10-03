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

/**
 * The lint started when the document was opened, empty, may report after the
 * content is in, so only a result that has the script's findings will do.
 */
function hasSC2086(diagnostics: readonly vscode.Diagnostic[]): boolean {
  return diagnostics.some(
    ({ code }) => typeof code === "object" && code.value === "SC2086",
  );
}

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
      await waitForDiagnostics(document, undefined, hasSC2086);

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
    });

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
      await waitForDiagnostics(document, undefined, hasSC2086);

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
