import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
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

function workspaceFolder(): vscode.Uri {
  return vscode.workspace.workspaceFolders![0].uri;
}

/** Every config file the suite writes, so teardown can remove them all. */
function configFiles() {
  return {
    workspace: vscode.Uri.joinPath(workspaceFolder(), ".shellcheckrc"),
    parent: vscode.Uri.joinPath(workspaceFolder(), "..", ".shellcheckrc"),
    custom: vscode.Uri.joinPath(workspaceFolder(), "custom.rc"),
  };
}

async function write(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

async function remove(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // Already gone.
  }
}

async function removeConfigFiles(): Promise<void> {
  for (const uri of Object.values(configFiles())) {
    await remove(uri);
  }
}

/**
 * Opens the script and waits until it has no lint left to run, as one still
 * pending would re-read the rc files the caller is about to change.
 */
async function openLintedScript(): Promise<vscode.TextDocument> {
  await updateShellCheckSetting("exclude", ["2034"]);
  const document = await openWorkspaceDocument("script.sh");
  // A lint keeps the settings it was triggered with, so only the one that
  // lifting the exclusion triggers reports SC2034, and every lint triggered
  // before it has either run already or been merged into it.
  await expectSC2034(document, true, () =>
    updateShellCheckSetting("exclude", undefined),
  );
  return document;
}

/** Run `action` and wait for the document's SC2034 to come or go. */
async function expectSC2034(
  document: vscode.TextDocument,
  present: boolean,
  action: () => Promise<void>,
): Promise<void> {
  const settled = waitForDiagnostics(
    document,
    15000,
    (diagnostics) => hasSC2034(diagnostics) === present,
  );
  await action();
  await settled;
}

/** Run `action` and check the document's diagnostics were left alone. */
async function expectUnchanged(
  document: vscode.TextDocument,
  action: () => Promise<void>,
): Promise<void> {
  await action();
  // A re-lint would have dropped SC2034 well within this window.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  assert.ok(hasSC2034(vscode.languages.getDiagnostics(document.uri)));
}

function setupSuite(runtime: "native" | "wasm") {
  suiteSetup(async () => {
    await setRuntime(runtime);
  });

  suiteTeardown(async () => {
    await resetRuntime();
  });

  setup(async () => {
    await removeConfigFiles();
  });

  teardown(async () => {
    await updateShellCheckSetting("exclude", undefined);
    await updateShellCheckSetting("watchConfigFiles.workspace", undefined);
    await updateShellCheckSetting("watchConfigFiles.user", undefined);
    await updateShellCheckSetting("customArgs", undefined);
    await closeAllEditors();
    await removeConfigFiles();
  });
}

for (const runtime of RUNTIMES) {
  suite(`Config file changes (${runtime} runtime)`, function () {
    // Each case waits on file watcher events on top of a lint.
    this.timeout(30000);
    setupSuite(runtime);

    test("a workspace .shellcheckrc being created, changed or deleted re-lints", async () => {
      await updateShellCheckSetting("watchConfigFiles.workspace", true);
      const { workspace } = configFiles();
      const document = await openLintedScript();

      await expectSC2034(document, false, () =>
        write(workspace, "disable=SC2034\n"),
      );
      await expectSC2034(document, true, () =>
        write(workspace, "disable=SC2154\n"),
      );
      await expectSC2034(document, false, () =>
        write(workspace, "disable=SC2034\n"),
      );
      await expectSC2034(document, true, () => remove(workspace));
    });

    test("nothing is watched by default", async () => {
      const document = await openLintedScript();
      await expectUnchanged(document, () =>
        write(configFiles().workspace, "disable=SC2034\n"),
      );
    });
  });
}

suite(
  "Config file changes outside the workspace (native runtime)",
  function () {
    this.timeout(30000);
    setupSuite("native");

    test("an rc file above the workspace folder re-lints", async () => {
      await updateShellCheckSetting("watchConfigFiles.user", true);
      const { parent } = configFiles();
      const document = await openLintedScript();

      await expectSC2034(document, false, () =>
        write(parent, "disable=SC2034\n"),
      );
      await expectSC2034(document, true, () => remove(parent));
    });

    test("an rc file above the workspace folder needs the user setting", async () => {
      await updateShellCheckSetting("watchConfigFiles.workspace", true);
      const document = await openLintedScript();
      await expectUnchanged(document, () =>
        write(configFiles().parent, "disable=SC2034\n"),
      );
    });

    test("the file passed with --rcfile re-lints", async () => {
      const { custom } = configFiles();
      await updateShellCheckSetting("watchConfigFiles.workspace", true);
      await updateShellCheckSetting("customArgs", ["--rcfile", custom.fsPath]);
      const document = await openLintedScript();

      await expectSC2034(document, false, () =>
        write(custom, "disable=SC2034\n"),
      );
      await expectSC2034(document, true, () =>
        write(custom, "disable=SC2154\n"),
      );
      await expectSC2034(document, false, () =>
        write(custom, "disable=SC2034\n"),
      );
      await expectSC2034(document, true, () => remove(custom));
    });
  },
);
