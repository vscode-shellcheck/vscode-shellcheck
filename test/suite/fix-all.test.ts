import * as assert from "node:assert";
import * as vscode from "vscode";
import { sleep } from "./utils";

suite("Fix all", () => {
  test("Extension should fix issues automatically on demand", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: `#!/bin/bash
echo $SHELL
echo $SHELL
eval \`uname -r\`
`,
      language: "shellscript",
    });

    const editor = await vscode.window.showTextDocument(document);

    // some time is required to lint
    await sleep(1500);

    await vscode.commands.executeCommand("editor.action.fixAll");
    // some time is required to fix the issues
    await sleep(1500);

    assert.strictEqual(
      editor.document.getText(),
      `#!/bin/bash
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`,
    );
  });

  test("Extension should fix only one issue in a same range", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: `#!/bin/bash
# shellcheck enable=require-variable-braces
echo $SHELL
echo $SHELL
eval \`uname -r\`
`,
      language: "shellscript",
    });

    const editor = await vscode.window.showTextDocument(document);

    // some time is required to lint
    await sleep(1500);

    await vscode.commands.executeCommand("editor.action.fixAll");
    // some time is required to fix the issues
    await sleep(1500);

    assert.strictEqual(
      editor.document.getText(),
      `#!/bin/bash
# shellcheck enable=require-variable-braces
echo "$SHELL"
echo "$SHELL"
eval $(uname -r)
`,
    );
  });
});
