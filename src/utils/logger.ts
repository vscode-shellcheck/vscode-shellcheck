import * as vscode from 'vscode';


let outputChannel: vscode.OutputChannel;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('shellcheck');
    }
    return outputChannel;
}
