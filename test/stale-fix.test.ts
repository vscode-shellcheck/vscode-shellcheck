import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  lintActiveDocument,
  openDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  updateShellCheckSetting,
} from "./helpers.js";

const SCRIPT = `#!/bin/bash
echo $SHELL
eval \`uname -r\`
`;

/** Inserts a line above every finding in `SCRIPT`. */
async function insertCommentLine(document: vscode.TextDocument) {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, new vscode.Position(1, 0), "# a comment line\n");
  assert.ok(await vscode.workspace.applyEdit(edit));
}

function findSC2086(
  diagnostics: readonly vscode.Diagnostic[],
  line: number,
): vscode.Diagnostic | undefined {
  return diagnostics.find(
    ({ code, range }) =>
      typeof code === "object" &&
      code.value === "SC2086" &&
      range.start.line === line,
  );
}

/**
 * Lints the document until SC2086 is reported on `line`, where the current
 * text has it: the lint started when the document was opened, empty, may still
 * be running.
 */
async function lintForSC2086(
  document: vscode.TextDocument,
  line: number,
): Promise<vscode.Range> {
  const diagnostics = await lintActiveDocument(
    document,
    undefined,
    (diagnostics) => findSC2086(diagnostics, line) !== undefined,
  );
  return findSC2086(diagnostics, line)!.range;
}

async function getShellCheckFixes(
  document: vscode.TextDocument,
  range: vscode.Range,
  kind?: string,
): Promise<vscode.CodeAction[]> {
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    document.uri,
    range,
    kind,
  );
  return actions.filter(
    (action) => action.title.startsWith("ShellCheck: ") && action.edit,
  );
}

async function applyAll(actions: vscode.CodeAction[]) {
  for (const action of actions) {
    assert.ok(await vscode.workspace.applyEdit(action.edit!));
  }
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(
    new vscode.Position(0, 0),
    document.lineAt(document.lineCount - 1).range.end,
  );
}

for (const runtime of RUNTIMES) {
  suite(`Fixes for an edited document (${runtime} runtime)`, () => {
    suiteSetup(async () => {
      await setRuntime(runtime);
      // Nothing lints the document again between the edit and the fix.
      await updateShellCheckSetting("run", "manual");
    });

    suiteTeardown(async () => {
      await updateShellCheckSetting("run", undefined);
      await resetRuntime();
    });

    teardown(async () => {
      await closeAllEditors();
    });

    test("A quick fix is not applied to lines that moved since the lint", async () => {
      const document = await openDocument(SCRIPT, "shellscript");
      const linted = await lintForSC2086(document, 1);

      await insertCommentLine(document);
      const edited = document.getText();
      await applyAll(await getShellCheckFixes(document, linted));
      assert.strictEqual(document.getText(), edited);

      const fresh = await lintForSC2086(document, 2);
      await applyAll(await getShellCheckFixes(document, fresh));
      assert.strictEqual(
        document.getText(),
        `#!/bin/bash
# a comment line
echo "$SHELL"
eval \`uname -r\`
`,
      );
    });

    test("Fix all is not applied to lines that moved since the lint", async () => {
      const document = await openDocument(SCRIPT, "shellscript");
      await lintForSC2086(document, 1);

      await insertCommentLine(document);
      const edited = document.getText();
      await applyAll(
        await getShellCheckFixes(
          document,
          fullRange(document),
          vscode.CodeActionKind.SourceFixAll.value,
        ),
      );
      assert.strictEqual(document.getText(), edited);

      await lintForSC2086(document, 2);
      await applyAll(
        await getShellCheckFixes(
          document,
          fullRange(document),
          vscode.CodeActionKind.SourceFixAll.value,
        ),
      );
      assert.strictEqual(
        document.getText(),
        `#!/bin/bash
# a comment line
echo "$SHELL"
eval $(uname -r)
`,
      );
    });
  });
}
