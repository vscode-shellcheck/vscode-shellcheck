import * as path from 'path';
import * as vscode from 'vscode';
import { ThrottledDelayer } from './utils/async';
import { FileMatcher, FileSettings } from './utils/filematcher';
import { checkTool } from './utils/tool-check';
import * as wsl from './utils/wslSupport';


interface ShellCheckSettings {
    enabled: boolean;
    executable: string;
    trigger: RunTrigger;
    exclude: string[];
    customArgs: string[];
    ignorePatterns: FileSettings;
    ignoreFileSchemes: Set<string>;
    useWorkspaceRootAsCwd: boolean;
    useWSL: boolean;
}

enum RunTrigger {
    onSave,
    onType,
    manual,
}

namespace RunTrigger {
    export const strings = {
        onSave: 'onSave',
        onType: 'onType',
        manual: 'manual',
    };

    export function from(value: string): RunTrigger {
        switch (value) {
            case strings.onSave:
                return RunTrigger.onSave;
            case strings.onType:
                return RunTrigger.onType;
            default:
                return RunTrigger.manual;
        }
    }
}

namespace CommandIds {
    export const runLint: string = 'shellcheck.runLint';
    export const openRuleDoc: string = 'shellcheck.openRuleDoc';
}

interface ShellCheckItem {
    file: string;
    line: number;
    endLine?: number;
    column: number;
    endColumn?: number;
    level: string;
    code: number;
    message: string;
}

function fixPosition(textDocument: vscode.TextDocument, pos: vscode.Position): vscode.Position {
    // Since json format treats tabs as **8** characters, we need to offset it.
    let charPos = pos.character;
    const s = textDocument.getText(new vscode.Range(pos.with({ character: 0 }), pos));
    for (const ch of s) {
        if (ch === '\t') {
            charPos -= 7;
        }
    }

    return pos.with({ character: charPos });
}

function levelToDiagnosticSeverity(level: string): vscode.DiagnosticSeverity {
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

function scCodeToDiagnosticTags(code: number): vscode.DiagnosticTag[] | undefined {
    // SC2034 - https://github.com/koalaman/shellcheck/wiki/SC2034
    if (code === 2034) {
        return [vscode.DiagnosticTag.Unnecessary];
    }

    return undefined;
}

function makeDiagnostic(textDocument: vscode.TextDocument, item: ShellCheckItem): vscode.Diagnostic {
    let startPos = new vscode.Position(item.line - 1, item.column - 1);
    const endLine = item.endLine ? item.endLine - 1 : startPos.line;
    const endCharacter = item.endColumn ? item.endColumn - 1 : startPos.character;
    let endPos = new vscode.Position(endLine, endCharacter);
    if (startPos.isEqual(endPos)) {
        startPos = fixPosition(textDocument, startPos);
        endPos = startPos;
    } else {
        startPos = fixPosition(textDocument, startPos);
        endPos = fixPosition(textDocument, endPos);
    }

    const range = new vscode.Range(startPos, endPos);
    const severity = levelToDiagnosticSeverity(item.level);
    const diagnostic = new vscode.Diagnostic(range, item.message, severity);
    diagnostic.source = 'shellcheck';
    diagnostic.code = `SC${item.code}`;
    diagnostic.tags = scCodeToDiagnosticTags(item.code);
    return diagnostic;
}

function substitutePath(s: string): string {
    return s.replace(/\${workspaceRoot}/g, vscode.workspace.rootPath || '');
}

export default class ShellCheckProvider implements vscode.CodeActionProvider {

    private static LANGUAGE_ID = 'shellscript';
    private settings!: ShellCheckSettings;
    private executableNotFound: boolean;
    private documentListener!: vscode.Disposable;
    private delayers!: { [key: string]: ThrottledDelayer<void> };
    private readonly fileMatcher: FileMatcher;
    private readonly diagnosticCollection: vscode.DiagnosticCollection;

    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.executableNotFound = false;
        this.fileMatcher = new FileMatcher();
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();

        // code actions
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider('shellscript', this, {
                providedCodeActionKinds: ShellCheckProvider.providedCodeActionKinds,
            }),
        );

        // commands
        context.subscriptions.push(
            vscode.commands.registerCommand(CommandIds.openRuleDoc, async (url: string) => {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
            }),
            vscode.commands.registerTextEditorCommand(CommandIds.runLint, async (editor) => {
                this.runLint(editor.document);
            }),
        );

        // populate this.settings
        this.loadConfiguration();
        checkTool(this.settings.useWSL, this.settings.executable);

        // event handlers
        vscode.workspace.onDidChangeConfiguration(this.loadConfiguration, this, context.subscriptions);
        vscode.workspace.onDidOpenTextDocument(this.triggerLint, this, context.subscriptions);
        vscode.workspace.onDidCloseTextDocument((textDocument) => {
            this.diagnosticCollection.delete(textDocument.uri);
            delete this.delayers[textDocument.uri.toString()];
        }, null, context.subscriptions);

        // Shellcheck all open shell documents
        vscode.workspace.textDocuments.forEach(this.triggerLint, this);
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        let actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'shellcheck') {
                continue;
            }

            if (typeof diagnostic.code === 'string' && diagnostic.code.startsWith('SC')) {
                const ruleId = diagnostic.code;
                const title = `Show ShellCheck Wiki for ${ruleId}`;
                const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                action.command = {
                    title: title,
                    command: CommandIds.openRuleDoc,
                    arguments: [`https://www.shellcheck.net/wiki/${ruleId}`],
                };
                actions.push(action);
            }
        }

        return actions;
    }

    public dispose(): void {
        this.disposeDocumentListener();
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }

    private disposeDocumentListener(): void {
        if (this.documentListener) {
            this.documentListener.dispose();
        }
    }

    private loadConfiguration(): void {
        const section = vscode.workspace.getConfiguration('shellcheck', null);
        const settings = <ShellCheckSettings>{
            enabled: section.get('enable', true),
            trigger: RunTrigger.from(section.get('run', RunTrigger.strings.onType)),
            executable: substitutePath(section.get('executablePath', 'shellcheck')),
            exclude: section.get('exclude', []),
            customArgs: section.get('customArgs', []),
            ignorePatterns: section.get('ignorePatterns', {}),
            ignoreFileSchemes: new Set(section.get('ignoreFileSchemes', ['git'])),
            useWorkspaceRootAsCwd: section.get('useWorkspaceRootAsCwd', false),
            useWSL: section.get('useWSL', false),
        };
        this.settings = settings;

        this.fileMatcher.configure(settings.ignorePatterns);
        this.delayers = Object.create(null);

        this.disposeDocumentListener();
        this.diagnosticCollection.clear();
        if (settings.enabled) {
            if (settings.trigger === RunTrigger.onType) {
                this.documentListener = vscode.workspace.onDidChangeTextDocument((e) => {
                    this.triggerLint(e.document);
                }, this, this.context.subscriptions);
            } else if (settings.trigger === RunTrigger.onSave) {
                this.documentListener = vscode.workspace.onDidSaveTextDocument(this.triggerLint, this, this.context.subscriptions);
            }
        }

        // Configuration has changed. Re-evaluate all documents
        this.executableNotFound = false;
        vscode.workspace.textDocuments.forEach(this.triggerLint, this);
    }

    private isAllowedTextDocument(textDocument: vscode.TextDocument): boolean {
        if (textDocument.languageId !== ShellCheckProvider.LANGUAGE_ID) {
            return false;
        }

        const scheme = textDocument.uri.scheme;
        return !this.settings.ignoreFileSchemes.has(scheme);
    }

    private triggerLint(textDocument: vscode.TextDocument): void {
        if (this.executableNotFound || !this.isAllowedTextDocument(textDocument)) {
            return;
        }

        if (!this.settings.enabled) {
            this.diagnosticCollection.delete(textDocument.uri);
            return;
        }

        if (vscode.workspace.rootPath && this.fileMatcher.excludes(textDocument.fileName, vscode.workspace.rootPath)) {
            return;
        }

        const key = textDocument.uri.toString();
        let delayer = this.delayers[key];
        if (!delayer) {
            delayer = new ThrottledDelayer<void>(this.settings.trigger === RunTrigger.onType ? 250 : 0);
            this.delayers[key] = delayer;
        }

        delayer.trigger(() => this.runLint(textDocument));
    }

    private runLint(textDocument: vscode.TextDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const settings = this.settings;
            if (settings.useWSL && !wsl.subsystemForLinuxPresent()) {
                if (!this.executableNotFound) {
                    vscode.window.showErrorMessage('Got told to use WSL, but cannot find installation. Bailing out.');
                }
                this.executableNotFound = true;
                resolve();
                return;
            }

            const executable = settings.executable || 'shellcheck';
            const diagnostics: vscode.Diagnostic[] = [];
            const processShellCheckItem = (item: ShellCheckItem) => {
                if (item) {
                    diagnostics.push(makeDiagnostic(textDocument, item));
                }
            };

            let args = ['-f', 'json'];
            if (settings.exclude.length) {
                args = args.concat(['-e', settings.exclude.join(',')]);
            }

            // https://github.com/timonwong/vscode-shellcheck/issues/43
            // We should explicit set shellname based on file extension name
            const fileExt = path.extname(textDocument.fileName);
            if (fileExt === '.bash' || fileExt === '.ksh' || fileExt === '.dash') {
                // shellcheck args: specify dialect (sh, bash, dash, ksh)
                args = args.concat(['-s', fileExt.substr(1)]);
            }

            if (settings.customArgs.length) {
                args = args.concat(settings.customArgs);
            }

            args.push('-'); // Use stdin for shellcheck

            let cwd: string | undefined;
            if (settings.useWorkspaceRootAsCwd) {
                cwd = vscode.workspace.rootPath;
            } else {
                cwd = textDocument.isUntitled ? vscode.workspace.rootPath : path.dirname(textDocument.fileName);
            }

            const options = cwd ? { cwd: cwd } : undefined;
            const childProcess = wsl.spawn(settings.useWSL, executable, args, options);
            childProcess.on('error', (error: Error) => {
                if (!this.executableNotFound) {
                    this.showShellCheckError(error, executable);
                }

                this.executableNotFound = true;
                resolve();
                return;
            });

            if (childProcess.pid) {
                childProcess.stdout.setEncoding('utf-8');

                let script = textDocument.getText();
                if (settings.useWSL) {
                    script = script.replace(/\r\n/g, '\n'); // shellcheck doesn't likes CRLF, although this is caused by a git checkout on Windows.
                }
                childProcess.stdin.write(script);
                childProcess.stdin.end();

                const output: string[] = [];
                childProcess.stdout
                    .on('data', (data: Buffer) => {
                        output.push(data.toString());
                    })
                    .on('end', () => {
                        if (output.length) {
                            JSON.parse(output.join('')).forEach(processShellCheckItem);
                        }

                        this.diagnosticCollection.set(textDocument.uri, diagnostics);
                        resolve();
                    });
            } else {
                resolve();
            }
        });
    }

    private showShellCheckError(error: any, executable: string): void {
        let message: string;
        if (error.code === 'ENOENT') {
            message = `Cannot shellcheck the shell script. The shellcheck program was not found. Use the 'shellcheck.executablePath' setting to configure the location of 'shellcheck' or enable WSL integration with 'shellcheck.useWSL'`;
        } else {
            message = error.message ? error.message : `Failed to run shellcheck using path: ${executable}. Reason is unknown.`;
        }

        vscode.window.showInformationMessage(message);
    }
}

