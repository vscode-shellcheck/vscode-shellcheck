import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  lintActiveDocument,
  openWorkspaceDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  updateShellCheckSetting,
  waitForDiagnostics,
} from "./helpers.js";

const hasSC2034 = (diagnostics: readonly vscode.Diagnostic[]) =>
  diagnostics.some(
    (diagnostic) =>
      typeof diagnostic.code === "object" && diagnostic.code.value === "SC2034",
  );

function rcUri(): vscode.Uri {
  return vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders![0].uri,
    ".shellcheckrc",
  );
}

async function writeRc(content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(
    rcUri(),
    new TextEncoder().encode(content),
  );
}

async function deleteRc(): Promise<void> {
  try {
    await vscode.workspace.fs.delete(rcUri());
  } catch {
    // Already gone.
  }
}

for (const runtime of RUNTIMES) {
  suite(`.shellcheckrc changes (${runtime} runtime)`, function () {
    // Each case waits on file watcher events on top of a lint.
    this.timeout(30000);

    suiteSetup(async () => {
      await setRuntime(runtime);
    });

    suiteTeardown(async () => {
      await resetRuntime();
    });

    teardown(async () => {
      await updateShellCheckSetting("lintOnShellcheckrcChange", undefined);
      await closeAllEditors();
      await deleteRc();
    });

    test("open documents are re-linted when .shellcheckrc is created, changed or deleted", async () => {
      await deleteRc();
      const document = await openWorkspaceDocument("script.sh");
      assert.ok(hasSC2034(await lintActiveDocument(document)));

      let cleared = waitForDiagnostics(document, 15000, (d) => !hasSC2034(d));
      await writeRc("disable=SC2034\n");
      await cleared;

      const restored = waitForDiagnostics(document, 15000, hasSC2034);
      await writeRc("disable=SC2154\n");
      await restored;

      cleared = waitForDiagnostics(document, 15000, (d) => !hasSC2034(d));
      await writeRc("disable=SC2034\n");
      await cleared;

      const afterDelete = waitForDiagnostics(document, 15000, hasSC2034);
      await deleteRc();
      await afterDelete;
    });

    test("nothing is re-linted when the setting is off", async () => {
      await deleteRc();
      await updateShellCheckSetting("lintOnShellcheckrcChange", false);
      const document = await openWorkspaceDocument("script.sh");
      assert.ok(hasSC2034(await lintActiveDocument(document)));

      await writeRc("disable=SC2034\n");
      // A re-lint would have dropped SC2034 well within this window.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      assert.ok(hasSC2034(vscode.languages.getDiagnostics(document.uri)));
    });
  });
}
