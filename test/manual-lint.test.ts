import assert from "node:assert";
import path from "node:path";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  updateShellCheckSetting,
  waitForDiagnostics,
  waitForText,
} from "./helpers.js";

const SCRIPT = "# shellcheck shell=bash\necho $1\n";

function findCode(
  diagnostics: readonly vscode.Diagnostic[],
  code: string,
  line?: number,
): vscode.Diagnostic | undefined {
  return diagnostics.find(
    (diagnostic) =>
      typeof diagnostic.code === "object" &&
      diagnostic.code.value === code &&
      (line === undefined || diagnostic.range.start.line === line),
  );
}

function hasCode(code: string, line?: number) {
  return (diagnostics: readonly vscode.Diagnostic[]) =>
    findCode(diagnostics, code, line) !== undefined;
}

/**
 * Lints a fresh shell script and waits for its findings. Triggered after the
 * document under test, so by then any lint still pending for that document
 * would have published too.
 */
async function lintSentinel() {
  const sentinel = await openDocument("#!/bin/bash\ny=1", "shellscript");
  await waitForDiagnostics(sentinel, 15000, hasCode("SC2034"), {
    acceptCurrent: true,
  });
}

/** Opens a template of a shell script, which no automatic lint touches. */
async function openTemplate(content = SCRIPT): Promise<vscode.TextDocument> {
  return await openDocument(content, "plaintext", ".sh.j2");
}

async function lintOnDemand(
  document: vscode.TextDocument,
  predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
): Promise<vscode.Diagnostic[]> {
  await vscode.window.showTextDocument(document);
  const diagnostics = waitForDiagnostics(document, 15000, predicate);
  await vscode.commands.executeCommand("shellcheck.runLintAnyLanguage");
  return await diagnostics;
}

async function codeActionTitles(
  document: vscode.TextDocument,
  range: vscode.Range,
): Promise<string[]> {
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    document.uri,
    range,
  );
  return actions.map((action) => action.title);
}

async function hoverTexts(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<string[]> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    position,
  );
  return hovers.flatMap((hover) =>
    hover.contents.map((content) =>
      typeof content === "string" ? content : content.value,
    ),
  );
}

const DISABLE_SC2086 = "ShellCheck: Disable SC2086 for this line";

function workbenchEditor(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("workbench.editor");
}

for (const runtime of RUNTIMES) {
  suite(`Lint any document on demand (${runtime} runtime)`, function () {
    // A wasm lint, and the sentinel lint behind it, can take several seconds.
    this.timeout(30000);

    suiteSetup(async () => {
      // Otherwise VS Code may guess shellscript for a plaintext template,
      // which then lints on its own.
      await workbenchEditor().update("languageDetection", false, true);
      await setRuntime(runtime);
    });

    suiteTeardown(async () => {
      await resetRuntime();
      await workbenchEditor().update("languageDetection", undefined, true);
    });

    teardown(async () => {
      await closeAllEditors();
      await updateShellCheckSetting("ignorePatterns", undefined);
      await updateShellCheckSetting("markdownDiagnostics", undefined);
    });

    test("lints the document only when asked", async () => {
      const document = await openTemplate();
      await lintSentinel();
      assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), []);

      await lintOnDemand(document, hasCode("SC2086", 1));
    });

    test("Lint Current Document leaves it alone", async () => {
      const document = await openTemplate();
      await vscode.commands.executeCommand("shellcheck.runLint");
      await lintSentinel();

      assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), []);
    });

    test("does not lint the document again when it changes", async () => {
      const document = await openTemplate();
      await lintOnDemand(document, hasCode("SC2086", 1));

      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(2, 0), "echo $2\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      await lintSentinel();

      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      assert.ok(hasCode("SC2086", 1)(diagnostics));
      assert.ok(!hasCode("SC2086", 2)(diagnostics));

      await lintOnDemand(document, hasCode("SC2086", 2));
    });

    test("leaves a document that matches ignorePatterns alone", async () => {
      const document = await openTemplate();
      await updateShellCheckSetting("ignorePatterns", {
        [`**/${path.basename(document.fileName)}`]: true,
      });

      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("shellcheck.runLintAnyLanguage");
      await lintSentinel();

      assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), []);
    });

    test("offers the quick fix that disables a check for the line", async () => {
      const document = await openTemplate();
      const diagnostics = await lintOnDemand(document, hasCode("SC2086", 1));
      const { range } = findCode(diagnostics, "SC2086", 1)!;

      assert.ok(
        (await codeActionTitles(document, range)).includes(DISABLE_SC2086),
      );

      const text = waitForText(document);
      await vscode.commands.executeCommand(
        "shellcheck.disableCheckForLine",
        document,
        "SC2086",
        range,
      );
      assert.strictEqual(
        await text,
        "# shellcheck shell=bash\n# shellcheck disable=SC2086\necho $1\n",
      );
    });

    test("shows the formatted hover for its diagnostics", async () => {
      await updateShellCheckSetting("markdownDiagnostics", true);
      const document = await openTemplate();
      const diagnostics = await lintOnDemand(document, hasCode("SC2086", 1));
      const { range } = findCode(diagnostics, "SC2086", 1)!;

      const contents = await hoverTexts(document, range.start);
      assert.ok(
        contents.some((content) => content.includes("(SC2086)")),
        contents.join("\n---\n"),
      );
    });

    test("offers the quick fix and hover in each language it lints", async () => {
      await updateShellCheckSetting("markdownDiagnostics", true);
      const document = await openDocument(SCRIPT, "ini", ".sh.j2");
      const diagnostics = await lintOnDemand(document, hasCode("SC2086", 1));
      const { range } = findCode(diagnostics, "SC2086", 1)!;

      assert.ok(
        (await codeActionTitles(document, range)).includes(DISABLE_SC2086),
      );
      assert.ok(
        (await hoverTexts(document, range.start)).some((content) =>
          content.includes("(SC2086)"),
        ),
      );
    });

    test("follows a shell directive for the dialect", async () => {
      const document = await openTemplate(
        "# shellcheck shell=sh\n[[ -n $1 ]] && echo hi\n",
      );
      await lintOnDemand(document, hasCode("SC3010", 1));
    });
  });
}
