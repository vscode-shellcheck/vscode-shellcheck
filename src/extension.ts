import * as vscode from "vscode";
import { ShellCheckExtensionApi } from "./api";
import { LinkifyProvider } from "./linkify";
import ShellCheckProvider from "./linter";

export function activate(
  context: vscode.ExtensionContext
): ShellCheckExtensionApi {
  const linter = new ShellCheckProvider(context);
  context.subscriptions.push(linter);

  // link provider
  const linker = vscode.languages.registerDocumentLinkProvider(
    ShellCheckProvider.LANGUAGE_ID,
    new LinkifyProvider()
  );
  context.subscriptions.push(linker);

  // public API surface
  return linter.provideApi();
}

export function deactivate(): void {}
