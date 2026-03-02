import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  waitForDiagnostics,
  waitForText,
} from "./helpers.js";

suite("Fix all", () => {
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
    await waitForDiagnostics(document.uri);

    const expected = `#!/bin/bash
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`;

    await vscode.commands.executeCommand("editor.action.fixAll");
    const text = await waitForText(document);

    assert.strictEqual(text, expected);
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
    await waitForDiagnostics(document.uri);

    const expected = `#!/bin/bash
# shellcheck enable=require-variable-braces
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`;

    await vscode.commands.executeCommand("editor.action.fixAll");
    const text = await waitForText(document);

    assert.strictEqual(text, expected);
  });
});
