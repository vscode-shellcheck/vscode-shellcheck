import * as vscode from "vscode";

let _documentIndex = 0;

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
  if (content.length > 0) {
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), content);
    });
  }

  return editor.document;
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

  const timer = new Promise<never>((_resolve, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Timed out after ${timeout}ms waiting for diagnostics on ${uri.toString()}`,
          ),
        ),
      timeout,
    ),
  );

  return Promise.race([event, timer]);
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

  const timer = new Promise<never>((_resolve, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(`Timed out after ${timeout}ms waiting for text change`),
        ),
      timeout,
    ),
  );

  return Promise.race([event, timer]);
}

/**
 * Close all open editors. Call this in `teardown()` to ensure a clean
 * state between tests.
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
