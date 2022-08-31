import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import * as vscode from "vscode";
import * as execa from "execa";
import { ShellCheckExtensionApi } from "./api";
import { createParser, ParseResult } from "./parser";
import { ThrottledDelayer } from "./utils/async";
import { FileMatcher, FileSettings } from "./utils/filematcher";
import { getToolVersion, tryPromptForUpdatingTool } from "./utils/tool-check";
import { guessDocumentDirname, getWorkspaceFolderPath } from "./utils/path";
import { FixAllProvider } from "./fix-all";
import { getWikiUrlForRule } from "./utils/link";

interface Executable {
  path: string;
  bundled: boolean;
}

interface ShellCheckSettings {
  enabled: boolean;
  enableQuickFix: boolean;
  executable: Executable;
  trigger: RunTrigger;
  exclude: string[];
  customArgs: string[];
  ignorePatterns: FileSettings;
  ignoreFileSchemes: Set<string>;
  useWorkspaceRootAsCwd: boolean;
  fileMatcher: FileMatcher;
}

enum RunTrigger {
  onSave,
  onType,
  manual,
}

namespace RunTrigger {
  export const strings = {
    onSave: "onSave",
    onType: "onType",
    manual: "manual",
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
  export const runLint: string = "shellcheck.runLint";
  export const openRuleDoc: string = "shellcheck.openRuleDoc";
}

type ToolStatus =
  | { ok: true; version: semver.SemVer }
  | { ok: false; reason: "executableNotFound" | "executionFailed" };

function substitutePath(s: string, workspaceFolder?: string): string {
  if (!workspaceFolder && vscode.workspace.workspaceFolders) {
    workspaceFolder = getWorkspaceFolderPath(
      vscode.window.activeTextEditor?.document.uri
    );
  }

  return s
    .replace(/\${workspaceRoot}/g, workspaceFolder || "")
    .replace(/\${workspaceFolder}/g, workspaceFolder || "");
}

export default class ShellCheckProvider implements vscode.CodeActionProvider {
  public static readonly LANGUAGE_ID = "shellscript";

  private channel: vscode.OutputChannel;
  private delayers: { [key: string]: ThrottledDelayer<void> };
  private readonly settingsByUri: Map<string, ShellCheckSettings>;
  private readonly toolStatusByPath: Map<string, ToolStatus>;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly codeActionCollection: Map<string, ParseResult[]>;
  private readonly additionalDocumentFilters: Set<vscode.DocumentFilter>;

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Source,
  ];

  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: ShellCheckProvider.providedCodeActionKinds,
  };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.channel = vscode.window.createOutputChannel("ShellCheck");
    this.delayers = Object.create(null);
    this.settingsByUri = new Map();
    this.toolStatusByPath = new Map();
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("shellcheck");
    this.codeActionCollection = new Map();
    this.additionalDocumentFilters = new Set();

    // code actions
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        ShellCheckProvider.LANGUAGE_ID,
        this,
        ShellCheckProvider.metadata
      )
    );
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        ShellCheckProvider.LANGUAGE_ID,
        new FixAllProvider(),
        FixAllProvider.metadata
      )
    );

    // commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        CommandIds.openRuleDoc,
        async (url: string) => {
          return await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(url)
          );
        }
      ),
      vscode.commands.registerTextEditorCommand(
        CommandIds.runLint,
        async (editor) => {
          return await this.triggerLint(editor.document);
        }
      )
    );

    // event handlers
    vscode.workspace.onDidChangeConfiguration(
      this.onDidChangeConfiguration,
      this,
      context.subscriptions
    );
    vscode.workspace.onDidOpenTextDocument(
      this.onDidOpenTextDocument,
      this,
      context.subscriptions
    );
    vscode.workspace.onDidCloseTextDocument(
      (textDocument) => {
        this.setResultCollections(textDocument.uri);
        this.settingsByUri.delete(textDocument.uri.toString());
        delete this.delayers[textDocument.uri.toString()];
      },
      null,
      context.subscriptions
    );
    vscode.workspace.onDidChangeTextDocument(
      this.onDidChangeTextDocument,
      this,
      context.subscriptions
    );
    vscode.workspace.onDidSaveTextDocument(
      this.onDidSaveTextDocument,
      this,
      context.subscriptions
    );

    // Shellcheck all open shell documents
    this.triggerLintForEntireWorkspace();
  }

  private onDidChangeConfiguration() {
    this.settingsByUri.clear();
    this.toolStatusByPath.clear();

    // Shellcheck all open shell documents
    this.triggerLintForEntireWorkspace();
  }

  private async onDidOpenTextDocument(textDocument: vscode.TextDocument) {
    try {
      await this.triggerLint(textDocument);
    } catch (error) {
      this.channel.appendLine(`[ERROR] onDidOpenTextDocument: ${error}`);
    }
  }

  private async onDidChangeTextDocument(
    textDocumentChangeEvent: vscode.TextDocumentChangeEvent
  ) {
    if (textDocumentChangeEvent.document.uri.scheme === "output") {
      /*
       * Special case: silently drop any event that comes from
       * an output channel. This avoids an endless feedback loop,
       * which would occur if this handler were to log something
       * to our own channel.
       * Output channels cannot be shell scripts anyway.
       */
      return;
    }
    try {
      await this.triggerLint(
        textDocumentChangeEvent.document,
        (settings) => settings.trigger === RunTrigger.onType
      );
    } catch (error) {
      this.channel.appendLine(`[ERROR] onDidChangeTextDocument: ${error}`);
    }
  }

  private async onDidSaveTextDocument(textDocument: vscode.TextDocument) {
    try {
      await this.triggerLint(
        textDocument,
        (settings) => settings.trigger === RunTrigger.onSave
      );
    } catch (error) {
      this.channel.appendLine(`[ERROR] onDidSaveTextDocument: ${error}`);
    }
  }

  private async triggerLintForEntireWorkspace() {
    for await (const textDocument of vscode.workspace.textDocuments) {
      try {
        await this.triggerLint(textDocument);
      } catch (error) {
        this.channel.appendLine(
          `[ERROR] triggerLintForEntireWorkspace: ${error}`
        );
      }
    }
  }

  public dispose(): void {
    this.diagnosticCollection.clear();
    this.codeActionCollection.clear();
    this.diagnosticCollection.dispose();
    this.channel.dispose();
  }

  private getExecutable(executablePath: string): Executable {
    let isBundled = false;
    if (executablePath) {
      executablePath = substitutePath(executablePath);
    } else {
      // Use bundled binaries (maybe)
      let suffix = "";
      let osarch = process.arch;
      if (process.platform === "win32") {
        if (process.arch === "x64" || process.arch === "ia32") {
          osarch = "x32";
        }
        suffix = ".exe";
      }
      executablePath = this.context.asAbsolutePath(
        `./binaries/${process.platform}/${osarch}/shellcheck${suffix}`
      );
      if (fs.existsSync(executablePath)) {
        isBundled = true;
      } else {
        // Fallback to default shellcheck path
        executablePath = "shellcheck";
      }
    }

    return {
      path: executablePath,
      bundled: isBundled,
    };
  }

  private async getSettings(
    textDocument: vscode.TextDocument
  ): Promise<ShellCheckSettings> {
    if (!this.settingsByUri.has(textDocument.uri.toString())) {
      await this.updateConfiguration(textDocument);
    }
    return this.settingsByUri.get(textDocument.uri.toString())!;
  }

  private async updateConfiguration(textDocument: vscode.TextDocument) {
    const section = vscode.workspace.getConfiguration(
      "shellcheck",
      textDocument
    );
    const settings = <ShellCheckSettings>{
      enabled: section.get("enable", true),
      trigger: RunTrigger.from(section.get("run", RunTrigger.strings.onType)),
      executable: this.getExecutable(section.get("executablePath", "")),
      exclude: section.get("exclude", []),
      customArgs: section
        .get("customArgs", [])
        .map((arg) => substitutePath(arg)),
      ignorePatterns: section.get("ignorePatterns", {}),
      ignoreFileSchemes: new Set(
        section.get("ignoreFileSchemes", ["git", "gitfs", "output"])
      ),
      useWorkspaceRootAsCwd: section.get("useWorkspaceRootAsCwd", false),
      enableQuickFix: section.get("enableQuickFix", false),
      fileMatcher: new FileMatcher(),
    };

    settings.fileMatcher.configure(settings.ignorePatterns);
    this.settingsByUri.set(textDocument.uri.toString(), settings);
    this.setResultCollections(textDocument.uri);

    if (
      settings.enabled &&
      !this.toolStatusByPath.has(settings.executable.path)
    ) {
      // Prompt user to update shellcheck binary when necessary
      let toolStatus: ToolStatus;
      try {
        toolStatus = {
          ok: true,
          version: await getToolVersion(settings.executable.path),
        };
      } catch (error: any) {
        this.showShellCheckError(error);
        toolStatus = { ok: false, reason: "executableNotFound" };
      }
      this.toolStatusByPath.set(settings.executable.path, toolStatus);

      if (toolStatus.ok) {
        if (settings.executable.bundled) {
          this.channel.appendLine(
            `[INFO] shellcheck (bundled) version: ${toolStatus.version}`
          );
        } else {
          this.channel.appendLine(
            `[INFO] shellcheck version: ${toolStatus.version}`
          );
          tryPromptForUpdatingTool(toolStatus.version);
        }
      }
    }
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "shellcheck") {
        continue;
      }

      if (
        typeof diagnostic.code === "object" &&
        typeof diagnostic.code.value === "string" &&
        diagnostic.code.value.startsWith("SC")
      ) {
        const ruleId = diagnostic.code.value;
        const title = `Show ShellCheck Wiki for ${ruleId}`;
        const action = new vscode.CodeAction(
          title,
          vscode.CodeActionKind.QuickFix
        );
        action.command = {
          title: title,
          command: CommandIds.openRuleDoc,
          arguments: [getWikiUrlForRule(ruleId)],
        };
        actions.push(action);
      }
    }

    const results = this.codeActionCollection.get(document.uri.toString());
    if (results && results.length) {
      for (const result of results) {
        if (!result.codeAction) {
          continue;
        }

        if (!result.diagnostic.range.contains(range)) {
          continue;
        }

        actions.push(result.codeAction);
      }
    }

    return actions;
  }

  public provideApi(): ShellCheckExtensionApi {
    return {
      apiVersion1: {
        registerDocumentFilter: this.registerDocumentFilter,
      },
    };
  }

  private registerDocumentFilter = (documentFilter: vscode.DocumentFilter) => {
    if (this.additionalDocumentFilters.has(documentFilter)) {
      // Duplicate request. Ignore.
      return vscode.Disposable.from();
    }
    this.additionalDocumentFilters.add(documentFilter);
    // A new language ID may provide new configuration defaults
    this.settingsByUri.clear();
    this.toolStatusByPath.clear();
    // Re-evaluate all open shell documents due to updated filters
    this.triggerLintForEntireWorkspace();

    return {
      dispose: () => {
        this.additionalDocumentFilters.delete(documentFilter);
        // Reset configuration defaults
        this.settingsByUri.clear();
        this.toolStatusByPath.clear();
      },
    };
  };

  private isAllowedTextDocument(textDocument: vscode.TextDocument): boolean {
    let allowedDocumentSelector: vscode.DocumentSelector = [
      ShellCheckProvider.LANGUAGE_ID,
      ...this.additionalDocumentFilters,
    ];
    return !!vscode.languages.match(allowedDocumentSelector, textDocument);
  }

  private async triggerLint(
    textDocument: vscode.TextDocument,
    extraCondition: (settings: ShellCheckSettings) => boolean = (_) => true
  ) {
    if (!this.isAllowedTextDocument(textDocument)) {
      return;
    }

    const settings: ShellCheckSettings = await this.getSettings(textDocument);
    if (
      !extraCondition(settings) ||
      !this.toolStatusByPath.get(settings.executable.path)!.ok ||
      settings.ignoreFileSchemes.has(textDocument.uri.scheme)
    ) {
      return;
    }

    if (!settings.enabled) {
      this.setResultCollections(textDocument.uri);
      return;
    }

    if (
      settings.fileMatcher.excludes(
        textDocument.fileName,
        getWorkspaceFolderPath(textDocument.uri, false)
      )
    ) {
      return;
    }

    const key = textDocument.uri.toString();
    let delayer = this.delayers[key];
    if (!delayer) {
      delayer = new ThrottledDelayer<void>(
        settings.trigger === RunTrigger.onType ? 250 : 0
      );
      this.delayers[key] = delayer;
    }

    delayer.trigger(() => this.runLint(textDocument, settings));
  }

  private runLint(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const toolStatus: ToolStatus = this.toolStatusByPath.get(
        settings.executable.path
      )!;
      if (!toolStatus.ok) {
        return reject(toolStatus.reason);
      }
      const executable = settings.executable || "shellcheck";
      const parser = createParser(textDocument, {
        toolVersion: toolStatus.version,
        enableQuickFix: settings.enableQuickFix,
      });
      let args = ["-f", parser.outputFormat];
      if (settings.exclude.length) {
        args = args.concat(["-e", settings.exclude.join(",")]);
      }

      // https://github.com/timonwong/vscode-shellcheck/issues/43
      // We should explicit set shellname based on file extension name
      const fileExt = path.extname(textDocument.fileName);
      if (fileExt === ".bash" || fileExt === ".ksh" || fileExt === ".dash") {
        // shellcheck args: specify dialect (sh, bash, dash, ksh)
        args = args.concat(["-s", fileExt.substring(1)]);
      }

      if (settings.customArgs.length) {
        args = args.concat(settings.customArgs);
      }

      args.push("-"); // Use stdin for shellcheck

      let cwd: string | undefined;

      if (settings.useWorkspaceRootAsCwd) {
        cwd = getWorkspaceFolderPath(textDocument.uri);
      } else {
        cwd = guessDocumentDirname(textDocument);
      }

      const options: execa.Options = { cwd: cwd ?? undefined };
      // this.channel.appendLine(`[DEBUG] Spawn: ${executable.path} ${args.join(' ')}`);
      const childProcess = execa(executable.path, args, options);
      childProcess.on("error", (error: NodeJS.ErrnoException) => {
        this.showShellCheckError(error);
        this.toolStatusByPath.set(settings.executable.path, {
          ok: false,
          reason: "executionFailed",
        });
        resolve();
        return;
      });

      if (childProcess.pid && childProcess.stdout && childProcess.stdin) {
        childProcess.stdout.setEncoding("utf-8");

        const script = textDocument.getText();
        childProcess.stdin.write(script);
        childProcess.stdin.end();

        const output: string[] = [];
        childProcess.stdout
          .on("data", (data: Buffer) => {
            output.push(data.toString());
          })
          .on("end", () => {
            let result: ParseResult[] | null = null;
            if (output.length) {
              result = parser.parse(output.join(""));
            }

            this.setResultCollections(textDocument.uri, result);
            resolve();
          });
      } else {
        resolve();
      }
    });
  }

  private setResultCollections(
    uri: vscode.Uri,
    results?: ParseResult[] | null
  ) {
    if (!results || !results.length) {
      this.diagnosticCollection.delete(uri);
      this.codeActionCollection.delete(uri.toString());
      return;
    }

    const diagnostics = results.map((result) => result.diagnostic);
    this.diagnosticCollection.set(uri, diagnostics);
    this.codeActionCollection.set(uri.toString(), results);
  }

  private async showShellCheckError(
    error: NodeJS.ErrnoException
  ): Promise<void> {
    let message: string;
    let items: string[] = [];
    if (error.code === "ENOENT") {
      message = `The shellcheck program was not found (not installed?). Use the 'shellcheck.executablePath' setting to configure the location of 'shellcheck'`;
      items = ["OK", "Installation Guide"];
    } else {
      message = `Failed to run shellcheck: [${error.code}] ${error.message}`;
    }

    const selected = await vscode.window.showErrorMessage(message, ...items);
    if (selected === "Installation Guide") {
      vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/koalaman/shellcheck#installing")
      );
    }
  }
}
