import * as path from "node:path";
import * as semver from "semver";
import * as vscode from "vscode";
import execa from "execa";
import { ShellCheckExtensionApi } from "./api";
import { createParser, ParseResult } from "./parser";
import { ThrottledDelayer } from "./utils/async";
import { getToolVersion, tryPromptForUpdatingTool } from "./utils/tool-check";
import {
  guessDocumentDirname,
  getWorkspaceFolderPath,
  ensureCurrentWorkingDirectory,
} from "./utils/path";
import { FixAllProvider } from "./fix-all";
import { getWikiUrlForRule } from "./utils/link";
import * as logging from "./utils/logging";
import {
  checkIfConfigurationChanged,
  getWorkspaceSettings,
  RunTrigger,
  ShellCheckSettings,
} from "./settings";

namespace CommandIds {
  export const runLint: string = "shellcheck.runLint";
  export const disableCheckForLine: string = "shellcheck.disableCheckForLine";
  export const openRuleDoc: string = "shellcheck.openRuleDoc";
  export const collectDiagnostics: string = "shellcheck.collectDiagnostics";
}

type ToolStatus =
  | { ok: true; version: semver.SemVer }
  | { ok: false; reason: "executableNotFound" | "executionFailed" };

function toolStatusByError(error: any): ToolStatus {
  if (error && error instanceof Error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { ok: false, reason: "executableNotFound" };
    }
  }

  return { ok: false, reason: "executionFailed" };
}

export default class ShellCheckProvider implements vscode.CodeActionProvider {
  public static readonly LANGUAGE_ID = "shellscript";

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Source,
  ];

  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: ShellCheckProvider.providedCodeActionKinds,
  };

  private delayers: { [key: string]: ThrottledDelayer<void> };
  private readonly settingsByUri: Map<string, ShellCheckSettings>;
  private readonly toolStatusByPath: Map<string, ToolStatus>;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly codeActionCollection: Map<string, ParseResult[]>;
  private readonly additionalDocumentFilters: Set<vscode.DocumentFilter>;

  constructor(private readonly context: vscode.ExtensionContext) {
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
        ShellCheckProvider.metadata,
      ),
    );
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        ShellCheckProvider.LANGUAGE_ID,
        new FixAllProvider(),
        FixAllProvider.metadata,
      ),
    );

    // commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        CommandIds.openRuleDoc,
        async (url: string) => {
          return await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(url),
          );
        },
      ),
      vscode.commands.registerCommand(
        CommandIds.disableCheckForLine,
        async (
          document: vscode.TextDocument,
          ruleId: string,
          range: vscode.Range,
        ) => {
          return await this.disableCheckForLine(document, ruleId, range);
        },
      ),
      vscode.commands.registerTextEditorCommand(
        CommandIds.runLint,
        async (editor) => {
          return await this.triggerLint(editor.document);
        },
      ),
      vscode.commands.registerTextEditorCommand(
        CommandIds.collectDiagnostics,
        async (editor) => {
          return await this.collectDiagnostics(editor.document);
        },
      ),
    );

    // event handlers
    vscode.workspace.onDidChangeConfiguration(
      this.onDidChangeConfiguration,
      this,
      context.subscriptions,
    );
    vscode.workspace.onDidOpenTextDocument(
      this.onDidOpenTextDocument,
      this,
      context.subscriptions,
    );
    vscode.workspace.onDidCloseTextDocument(
      this.onDidCloseTextDocument,
      this,
      context.subscriptions,
    );
    vscode.workspace.onDidChangeTextDocument(
      this.onDidChangeTextDocument,
      this,
      context.subscriptions,
    );
    vscode.workspace.onDidSaveTextDocument(
      this.onDidSaveTextDocument,
      this,
      context.subscriptions,
    );

    // Shellcheck all open shell documents
    this.triggerLintForEntireWorkspace();
  }

  private onDidCloseTextDocument(textDocument: vscode.TextDocument) {
    this.setResultCollections(textDocument.uri);
    this.settingsByUri.delete(textDocument.uri.toString());
    delete this.delayers[textDocument.uri.toString()];
  }

  private onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
    if (!checkIfConfigurationChanged(e)) {
      return;
    }

    this.settingsByUri.clear();
    this.toolStatusByPath.clear();

    // Shellcheck all open shell documents
    this.triggerLintForEntireWorkspace();
  }

  private async onDidOpenTextDocument(textDocument: vscode.TextDocument) {
    try {
      await this.triggerLint(textDocument);
    } catch (error) {
      logging.error(`onDidOpenTextDocument: ${error}`);
    }
  }

  private async onDidChangeTextDocument(
    textDocumentChangeEvent: vscode.TextDocumentChangeEvent,
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
        (settings) => settings.trigger === RunTrigger.onType,
      );
    } catch (error) {
      logging.error(`onDidChangeTextDocument: ${error}`);
    }
  }

  private async onDidSaveTextDocument(textDocument: vscode.TextDocument) {
    try {
      await this.triggerLint(
        textDocument,
        (settings) => settings.trigger === RunTrigger.onSave,
      );
    } catch (error) {
      logging.error(`onDidSaveTextDocument ${error}`);
    }
  }

  private async triggerLintForEntireWorkspace() {
    for await (const textDocument of vscode.workspace.textDocuments) {
      try {
        await this.triggerLint(textDocument);
      } catch (error) {
        logging.error(`triggerLintForEntireWorkspace: ${error}`);
      }
    }
  }

  public dispose(): void {
    this.codeActionCollection.clear();
    this.diagnosticCollection.dispose();
  }

  private async getSettings(
    textDocument: vscode.TextDocument,
  ): Promise<ShellCheckSettings> {
    if (!this.settingsByUri.has(textDocument.uri.toString())) {
      await this.updateConfiguration(textDocument);
    }
    return this.settingsByUri.get(textDocument.uri.toString())!;
  }

  private async updateConfiguration(textDocument: vscode.TextDocument) {
    const settings = await getWorkspaceSettings(this.context, textDocument);

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
        logging.debug("Failed to get tool version: %O", error);
        this.showShellCheckError(error);
        toolStatus = toolStatusByError(error);
      }
      this.toolStatusByPath.set(settings.executable.path, toolStatus);

      if (toolStatus.ok) {
        if (settings.executable.bundled) {
          logging.info(`shellcheck (bundled) version: ${toolStatus.version}`);
        } else {
          logging.info(`shellcheck version: ${toolStatus.version}`);
          tryPromptForUpdatingTool(toolStatus.version);
        }
      }
    }
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
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
        const title = `ShellCheck: Show wiki for ${ruleId}`;
        const action = new vscode.CodeAction(
          title,
          vscode.CodeActionKind.QuickFix,
        );
        action.command = {
          title,
          command: CommandIds.openRuleDoc,
          arguments: [getWikiUrlForRule(ruleId)],
        };
        actions.push(action);
      }
    }

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
        const title = `ShellCheck: Disable ${ruleId} for this line`;
        const action = new vscode.CodeAction(
          title,
          vscode.CodeActionKind.QuickFix,
        );
        action.command = {
          title,
          command: CommandIds.disableCheckForLine,
          arguments: [document, ruleId, diagnostic.range],
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
    const allowedDocumentSelector: vscode.DocumentSelector = [
      ShellCheckProvider.LANGUAGE_ID,
      ...this.additionalDocumentFilters,
    ];
    return !!vscode.languages.match(allowedDocumentSelector, textDocument);
  }

  private async collectDiagnostics(textDocument: vscode.TextDocument) {
    const output: string[] = [
      "## Document\n",
      `URI: \`${textDocument.uri.toString()}\``,
      `Language: \`${textDocument.languageId}\``,
      "",
    ];

    output.push("## ShellCheck\n");
    const settings: ShellCheckSettings = await this.getSettings(textDocument);
    const toolStatus = this.toolStatusByPath.get(settings.executable.path);
    if (toolStatus && toolStatus.ok) {
      output.push(
        `- Version: \`${toolStatus.version}\``,
        `- Bundled: \`${settings.executable.bundled}\``,
        "",
      );
    } else {
      output.push("- ShellCheck is not installed or not working");
      output.push("");
    }

    const warnings: string[] = [];
    if (!this.isAllowedTextDocument(textDocument)) {
      warnings.push("- Document is not a shell script or is filtered out");
    }

    if (settings.ignoreFileSchemes.has(textDocument.uri.scheme)) {
      warnings.push(
        `- File scheme of document is ignored: ${textDocument.uri.scheme} not in \`shellcheck.ignoreFileSchemes\``,
      );
    }

    if (warnings.length) {
      output.push("## Warnings\n");
      output.push(...warnings);
      output.push("");
    }
    const ext = vscode.extensions.getExtension("mads-hartmann.bash-ide-vscode");
    if (ext) {
      const bashIdeSection = vscode.workspace.getConfiguration(
        "bashIde",
        textDocument,
      );
      if (bashIdeSection.get<boolean>("enableSourceErrorDiagnostics")) {
        output.push(
          "## Notes about Bash IDE Extension\n",
          "- This extension may overlaps the Bash IDE extension, to disable linting in Bash IDE, you can set `bashIde.enableSourceErrorDiagnostics` to `false`.",
        );
      }
    }

    output.push("");

    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: output.join("\n"),
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private async disableCheckForLine(
    textDocument: vscode.TextDocument,
    ruleId: string,
    range: vscode.Range,
  ) {
    if (!this.isAllowedTextDocument(textDocument)) {
      return;
    }
    const targetLine = textDocument.lineAt(range.start.line);
    const indent = targetLine.text.substring(
      0,
      targetLine.firstNonWhitespaceCharacterIndex,
    );

    const textEdit = vscode.TextEdit.insert(
      new vscode.Position(
        range.start.line,
        targetLine.firstNonWhitespaceCharacterIndex,
      ),
      `# shellcheck disable=${ruleId}\n${indent}`,
    );

    const edit = new vscode.WorkspaceEdit();
    edit.set(textDocument.uri, [textEdit]);

    vscode.workspace.applyEdit(edit);
  }

  private async triggerLint(
    textDocument: vscode.TextDocument,
    extraCondition: (settings: ShellCheckSettings) => boolean = (_) => true,
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
        getWorkspaceFolderPath(textDocument.uri, false),
      )
    ) {
      return;
    }

    const key = textDocument.uri.toString();
    let delayer = this.delayers[key];
    if (!delayer) {
      delayer = new ThrottledDelayer<void>(
        settings.trigger === RunTrigger.onType ? 250 : 0,
      );
      this.delayers[key] = delayer;
    }

    delayer.trigger(() => this.runLint(textDocument, settings));
  }

  private runLint(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const toolStatus: ToolStatus = this.toolStatusByPath.get(
        settings.executable.path,
      )!;
      if (!toolStatus.ok) {
        return reject(toolStatus.reason);
      }
      const executable = settings.executable;
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

      const handleError = (error: Error) => {
        logging.debug("Unable to start shellcheck: %O", error);
        this.showShellCheckError(error);
        this.toolStatusByPath.set(executable.path, toolStatusByError(error));
      };

      ensureCurrentWorkingDirectory(cwd)
        .then((resolvedCwd) => {
          cwd = resolvedCwd;
          logging.debug("Spawn: (cwd=%s) %s %s", cwd, executable.path, args);
          const options: execa.Options = { cwd };
          const childProcess = execa(executable.path, args, options);

          if (childProcess.pid && childProcess.stdin && childProcess.stdout) {
            childProcess.stdout.setEncoding("utf-8");

            const script = textDocument.getText();
            childProcess.stdin.write(script);
            childProcess.stdin.end();

            const buf: string[] = [];

            childProcess.stdout
              .on("data", (chunk: Buffer) => {
                buf.push(chunk.toString());
              })
              .on("end", () => {
                let result: ParseResult[] | null = null;
                const output = buf.join("");
                logging.trace("shellcheck response: %s", output);
                if (output.length) {
                  result = parser.parse(output);
                }
                this.setResultCollections(textDocument.uri, result);
                resolve();
              });

            childProcess.on("error", (error) => {
              handleError(error);
              resolve();
            });
          } else {
            childProcess.catch((error) => {
              handleError(error);
            });
            resolve();
          }
        })
        .catch((error) => {
          handleError(error);
          resolve();
        });
    });
  }

  private setResultCollections(
    uri: vscode.Uri,
    results?: ParseResult[] | null,
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

  private async showShellCheckError(err: any): Promise<void> {
    let message: string;
    let items: string[] = [];

    if (err && err instanceof Error) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        message = `The shellcheck program was not found (not installed?). Use the 'shellcheck.executablePath' setting to configure the location of 'shellcheck'`;
        items = ["OK", "Installation Guide"];
      } else {
        message = `Failed to run shellcheck: [${error.code}] ${error.message}`;
      }
    } else {
      message = `Failed to run shellcheck: unknown error`;
    }

    const selected = await vscode.window.showErrorMessage(message, ...items);
    if (selected === "Installation Guide") {
      vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/koalaman/shellcheck#installing"),
      );
    }
  }
}
