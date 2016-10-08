import { spawn } from 'child_process';

import * as vscode from 'vscode';

import { ThrottledDelayer } from './utils/async';


enum RunTrigger {
    onSave,
    onType
}

namespace RunTrigger {
    export const strings = {
        onSave: 'onSave',
        onType: 'onType'
    };

    export let from = function (value: string): RunTrigger {
        switch (value) {
            case strings.onSave:
                return RunTrigger.onSave;
            case strings.onType:
                return RunTrigger.onType;
        }
    };
}

interface ShellCheckItem {
    file: string;
    line: number;
    column: number;
    level: string;
    code: number;
    message: string;
}

function escapeRegexp(s: string): string {
  // Shamelessly stolen from https://github.com/atom/underscore-plus/blob/130913c179fe1d718a14034f4818adaf8da4db12/src/underscore-plus.coffee#L138
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

const NON_WORD_CHARACTERS = escapeRegexp('/\\()"\':,.;<>~!@#$%^&*|+=[]{}`?-…');
const WORD_REGEXP = new RegExp(`^[\t ]*$|[^\\s${NON_WORD_CHARACTERS}]+`);

function asDiagnostic(textDocument: vscode.TextDocument, item: ShellCheckItem): vscode.Diagnostic {
    let pos = new vscode.Position(item.line - 1, item.column - 1);
    let range = textDocument.getWordRangeAtPosition(pos);
    if (!range) {
        // Guess word range (code stolen from atom-linter)
        let textLine = textDocument.lineAt(pos);
        let colEnd = textLine.range.end.character;
        let match = WORD_REGEXP.exec(textLine.text.substr(pos.character));
        if (match) {
            colEnd = pos.character + match.index + match[0].length;
        }
        range = new vscode.Range(pos, pos.with({character: colEnd}));
    }

    let severity = asDiagnosticSeverity(item.level);
    let diagnostic = new vscode.Diagnostic(range, `${item.message} [SC${item.code}]`, severity);
    diagnostic.source = 'shellcheck';
    diagnostic.code = item.code;
    return diagnostic;
}

function asDiagnosticSeverity(level: string): vscode.DiagnosticSeverity {
    switch (level) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'style':
            /* falls through */
        case 'info':
            return vscode.DiagnosticSeverity.Information;
        case 'warning':
            /* falls through */
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

export default class ShellCheckProvider {

    private static languageId = 'shellscript';
    private enabled: boolean;
    private trigger: RunTrigger;
    private executable: string;
    private executableNotFound: boolean;
    private exclude: string[];
    private documentListener: vscode.Disposable;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private delayers: { [key: string]: ThrottledDelayer<void> };

    constructor() {
        this.enabled = true;
        this.trigger = null;
        this.executable = null;
        this.executableNotFound = false;
        this.exclude = [];
    }

    public activate(subscriptions: vscode.Disposable[]): void {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
        subscriptions.push(this);

        vscode.workspace.onDidChangeConfiguration(this.loadConfiguration, this, subscriptions);
        this.loadConfiguration();

        vscode.workspace.onDidOpenTextDocument(this.triggerLint, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument((textDocument) => {
            this.diagnosticCollection.delete(textDocument.uri);
            delete this.delayers[textDocument.uri.toString()];
        }, null, subscriptions);

        // Shellcheck all open shell documents
        vscode.workspace.textDocuments.forEach(this.triggerLint, this);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }

    private loadConfiguration(): void {
        let oldExecutable = this.executable;
        let section = vscode.workspace.getConfiguration('shellcheck');
        if (section) {
            this.enabled = section.get('enable', true);
            this.trigger = RunTrigger.from(section.get('run', RunTrigger.strings.onType));
            this.executable = section.get('executablePath', 'shellcheck');
            this.exclude = section.get('exclude', []);
        }

        this.delayers = Object.create(null);

        if (this.executableNotFound) {
            this.executableNotFound = oldExecutable === this.executable;
        }

        if (this.documentListener) {
            this.documentListener.dispose();
        }

        this.diagnosticCollection.clear();
        if (this.enabled) {
            if (this.trigger === RunTrigger.onType) {
                this.documentListener = vscode.workspace.onDidChangeTextDocument((e) => {
                    this.triggerLint(e.document);
                });
            } else if (this.trigger === RunTrigger.onSave) {
                this.documentListener = vscode.workspace.onDidSaveTextDocument(this.triggerLint, this);
            }
        }

        // Configuration has changed. Re-evaluate all documents
        vscode.workspace.textDocuments.forEach(this.triggerLint, this);
    }

    private triggerLint(textDocument: vscode.TextDocument): void {
        if (textDocument.languageId !== ShellCheckProvider.languageId || this.executableNotFound) {
            return;
        }

        if (!this.enabled) {
            this.diagnosticCollection.set(textDocument.uri, null);
            return;
        }

        let key = textDocument.uri.toString();
        let delayer = this.delayers[key];
        if (!delayer) {
            delayer = new ThrottledDelayer<void>(this.trigger === RunTrigger.onType ? 250 : 0);
            this.delayers[key] = delayer;
        }

        delayer.trigger(() => this.runLint(textDocument));
    }

    private runLint(textDocument: vscode.TextDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let executable = this.executable || 'shellcheck';
            let diagnostics: vscode.Diagnostic[] = [];
            let processLine = (item: ShellCheckItem) => {
                if (item) {
                    diagnostics.push(asDiagnostic(textDocument, item));
                }
            };

            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
            let args = ['-f', 'json'];

            if (this.exclude.length) {
                args = args.concat(['-e', this.exclude.join(',')]);
            }

            if (this.trigger === RunTrigger.onSave) {
                args.push(textDocument.fileName);
            } else {
                args.push('-');
            }

            let childProcess = spawn(executable, args, options);
            childProcess.on('error', (error: Error) => {
                if (this.executableNotFound) {
                    resolve();
                    return;
                }

                this.showError(error, executable);
                this.executableNotFound = true;
                resolve();
            });

            if (childProcess.pid) {
                childProcess.stdout.setEncoding('utf-8');

                if (this.trigger === RunTrigger.onType) {
                    childProcess.stdin.write(textDocument.getText());
                    childProcess.stdin.end();
                }

                let output = [];
                childProcess.stdout
                    .on('data', (data: Buffer) => {
                        output.push(data.toString());
                    })
                    .on('end', () => {
                        if (output.length) {
                            JSON.parse(output.join('')).forEach(processLine);
                        }

                        this.diagnosticCollection.set(textDocument.uri, diagnostics);
                        resolve();
                    });
            } else {
                resolve();
            }
        });
    }

    private showError(error: any, executable: string): void {
        let message: string = null;
        if (error.code === 'ENOENT') {
            message = `Cannot shellcheck the shell script. The shellcheck program was not found. Use the 'shellcheck.executablePath' setting to configure the location of 'shellcheck'`;
        } else {
            message = error.message ? error.message : `Failed to run shellcheck using path: ${executable}. Reason is unknown.`;
        }

        vscode.window.showInformationMessage(message);
    }
}
