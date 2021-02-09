import * as vscode from 'vscode';
import ShellCheckProvider from './linter';

export function activate(context: vscode.ExtensionContext): void {
    const linter = new ShellCheckProvider(context);
    context.subscriptions.push(linter);
}

export function deactivate(): void {}
