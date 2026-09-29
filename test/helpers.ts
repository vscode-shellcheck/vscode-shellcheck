import { isDeepStrictEqual } from "node:util";
import * as vscode from "vscode";
import { RuntimeKind } from "../src/runtime/types.js";

let _documentIndex = 0;

/** The runtimes every integration suite is run against. */
export const RUNTIMES: readonly RuntimeKind[] = ["native", "wasm"];

function rejectAfter(timeout: number, what: string): Promise<never> {
  return new Promise<never>((_resolve, reject) =>
    setTimeout(
      () =>
        reject(new Error(`Timed out after ${timeout}ms waiting for ${what}`)),
      timeout,
    ),
  );
}

/**
 * Open a new untitled document with the given content and language,
 * then show it in an editor.
 */
export async function openDocument(
  content: string,
  language: string,
): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:/document-${++_documentIndex}`);

  let document = await vscode.workspace.openTextDocument(uri);
  document = await vscode.languages.setTextDocumentLanguage(document, language);
  const editor = await vscode.window.showTextDocument(document);
  await editor.edit((editBuilder) => {
    editBuilder.setEndOfLine(vscode.EndOfLine.LF);
    if (content.length > 0) {
      editBuilder.insert(new vscode.Position(0, 0), content);
    }
  });

  return editor.document;
}

/** Open a file from the first workspace folder and show it in an editor. */
export async function openWorkspaceDocument(
  relativePath: string,
): Promise<vscode.TextDocument> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error(
      `Cannot open ${relativePath}: no workspace folder is open. This suite needs a \`workspaceFolder\` entry in .vscode-test.js`,
    );
  }

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, relativePath),
  );
  await vscode.window.showTextDocument(document);
  return document;
}

/**
 * Wait for diagnostics to appear on the given document URI.
 *
 * Registers the listener synchronously so events are never missed.
 * Uses `vscode.languages.onDidChangeDiagnostics` instead of arbitrary delays.
 */
export function waitForDiagnostics(
  document: vscode.TextDocument,
  timeout = 5000,
): Promise<vscode.Diagnostic[]> {
  const { uri } = document;
  const event = new Promise<vscode.Diagnostic[]>((resolve) => {
    const disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (!e.uris.some((u) => u.toString() === uri.toString())) {
        return;
      }
      const diagnostics = vscode.languages.getDiagnostics(uri);
      if (diagnostics.length > 0) {
        disposable.dispose();
        resolve(diagnostics);
      }
    });
  });

  return Promise.race([
    event,
    rejectAfter(timeout, `diagnostics on ${uri.toString()}`),
  ]);
}

/**
 * Lint the active document on demand and return the diagnostics it produced.
 *
 * The explicit command is what makes the result attributable to the runtime in
 * effect right now: waiting for whatever event arrives next would also accept a
 * lint that a settings change had already started.
 */
export async function lintActiveDocument(
  document: vscode.TextDocument,
  timeout = 15000,
): Promise<vscode.Diagnostic[]> {
  const diagnostics = waitForDiagnostics(document, timeout);
  await vscode.commands.executeCommand("shellcheck.runLint");
  return await diagnostics;
}

/**
 * Wait for a document's text to change.
 *
 * Uses `vscode.workspace.onDidChangeTextDocument` for event-based waiting.
 * Register this BEFORE triggering the action that changes the text to avoid
 * missing the event.
 */
export function waitForText(
  document: vscode.TextDocument,
  timeout = 5000,
): Promise<string> {
  const event = new Promise<string>((resolve) => {
    const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      disposable.dispose();
      resolve(e.document.getText());
    });
  });

  return Promise.race([event, rejectAfter(timeout, "a text change")]);
}

function waitForConfigurationChange(
  section: string,
  timeout = 10000,
): Promise<void> {
  const event = new Promise<void>((resolve) => {
    const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(section)) {
        return;
      }
      disposable.dispose();
      resolve();
    });
  });

  return Promise.race([event, rejectAfter(timeout, `${section} to change`)]);
}

/**
 * Write a `shellcheck.*` setting at global scope and wait for the extension to
 * have processed it.
 *
 * The stored value is compared first because VS Code only raises a
 * configuration change when that value really changes, so an unconditional wait
 * would hang on a redundant write.
 */
export async function updateShellCheckSetting(
  key: string,
  value: unknown,
): Promise<void> {
  const section = vscode.workspace.getConfiguration("shellcheck");
  if (isDeepStrictEqual(section.inspect(key)?.globalValue, value)) {
    return;
  }

  const changed = waitForConfigurationChange(`shellcheck.${key}`);
  await section.update(key, value, vscode.ConfigurationTarget.Global);
  await changed;
}

/**
 * Switch the extension to `runtime` and wait until it has taken effect.
 *
 * `native` is cleared rather than written, because it is the contributed
 * default: that keeps every transition a real change of the effective value,
 * which is what raises the configuration event this waits on.
 */
export function setRuntime(runtime: RuntimeKind): Promise<void> {
  return updateShellCheckSetting(
    "runtime",
    runtime === "native" ? undefined : runtime,
  );
}

export function resetRuntime(): Promise<void> {
  return setRuntime("native");
}

/**
 * Close all open editors. Call this in `teardown()` to ensure a clean
 * state between tests.
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
