import * as vscode from "vscode";
import ShellCheckProvider from "./linter";

export function activateInternal(
  context: vscode.ExtensionContext,
  perfStats: { loadStartTime: number; loadEndTime: number }
): void {
  const linter = new ShellCheckProvider(context);
  context.subscriptions.push(linter);
}

export function deactivateInternal(): void {}
