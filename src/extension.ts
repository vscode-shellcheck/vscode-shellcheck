import * as vscode from "vscode";
import { LinkifyProvider } from "./linkify";
import ShellCheckProvider from "./linter";

export function activate(context: vscode.ExtensionContext): void {
  const linter = new ShellCheckProvider(context);
  context.subscriptions.push(linter);

  // link provider
  const linker = vscode.languages.registerDocumentLinkProvider(
    ShellCheckProvider.LANGUAGE_ID,
    new LinkifyProvider()
  );
  context.subscriptions.push(linker);
}

export function deactivate(): void {}
