import { extname } from "node:path";
import { SemVer } from "semver";
import * as vscode from "vscode";
import { ShellCheckExtensionApi } from "./api.js";
import {
  applyFailureEffect,
  describeShellCheckError,
  effectOfSelection,
  FailureActionHost,
  FailureNotification,
  WasmFailureNotifier,
} from "./failure-ux.js";
import { FixAllProvider } from "./fix-all.js";
import { createParser, ParseResult } from "./parser.js";
import { RuntimeManager } from "./runtime/manager.js";
import {
  LintResult,
  RunnerDisposedError,
  RunSupersededError,
  RuntimeKind,
  WasmRuntimeError,
} from "./runtime/types.js";
import { hasHostAbsolutePath } from "./runtime/wasm/guest-path.js";
import { resolveDocumentMount } from "./runtime/wasm/workspace-fs.js";
import {
  checkIfConfigurationChanged,
  getWorkspaceSettings,
  RunTrigger,
  ShellCheckSettings,
} from "./settings.js";
import { ThrottledDelayer } from "./utils/async.js";
import { getWikiUrlForRule } from "./utils/link.js";
import * as logging from "./utils/logging/index.js";
import {
  ensureCurrentWorkingDirectory,
  getWorkspaceFolderPath,
  guessDocumentDirname,
} from "./utils/path.js";
import {
  getToolVersion,
  tryPromptForUpdatingTool,
} from "./utils/tool-check.js";

namespace CommandIds {
  export const runLint: string = "shellcheck.runLint";
  export const disableCheckForLine: string = "shellcheck.disableCheckForLine";
  export const openRuleDoc: string = "shellcheck.openRuleDoc";
  export const collectDiagnostics: string = "shellcheck.collectDiagnostics";
}

/** What made the linter look at a document, as logged. */
type LintTrigger =
  | "open"
  | "change"
  | "save"
  | "config-change"
  | "workspace-initial"
  | "document-filter-registered"
  | "manual";

/**
 * Tool status key for the wasm runtime, which has no executable path. The NUL
 * byte cannot appear in one, so it cannot collide.
 */
const WASM_STATUS_KEY = "\u0000wasm";

function toolStatusKey(settings: ShellCheckSettings): string {
  return settings.runtime === "wasm"
    ? WASM_STATUS_KEY
    : settings.executable.path;
}

/** Debounce for `onType`, longer for wasm because a lint costs several times
 * more there and a keystroke-rate debounce would keep it saturated. */
function lintDelay(settings: ShellCheckSettings): number {
  if (settings.trigger !== RunTrigger.onType) {
    return 0;
  }
  return settings.runtime === "wasm" ? 750 : 250;
}

function isVirtualWorkspace(): boolean {
  const folders = vscode.workspace.workspaceFolders;
  return !!folders?.length && folders.every((f) => f.uri.scheme !== "file");
}

/**
 * The native program reads its files off the local disk, where no document of
 * a virtual workspace lives, and may not even exist on a machine that opens
 * one; only the wasm runtime reads through `workspace.fs`. Untitled documents
 * need no files and are still linted.
 */
function isOutOfNativeReach(
  textDocument: vscode.TextDocument,
  settings: ShellCheckSettings,
): boolean {
  const { scheme } = textDocument.uri;
  return (
    settings.runtime === "native" &&
    scheme !== "file" &&
    scheme !== "untitled" &&
    isVirtualWorkspace()
  );
}

type ToolStatus =
  | { ok: true; version: SemVer; ghcVersion?: string }
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
  public static readonly LANGUAGES = ["shellscript", "bats"];

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
  private wasmExecutablePathNoticed: boolean;
  /** Lives as long as the extension host, so `onDidChangeConfiguration`
   * deliberately leaves it alone. */
  private readonly wasmFailureNotifier: WasmFailureNotifier;
  /** Tags the log lines of one run, across both runtimes. */
  private nextRunId: number;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runtimeManager: RuntimeManager,
    /** Reveals the output channel owned by `activate`. */
    private readonly revealLog: () => void,
  ) {
    this.delayers = Object.create(null);
    this.settingsByUri = new Map();
    this.toolStatusByPath = new Map();
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("shellcheck");
    this.codeActionCollection = new Map();
    this.additionalDocumentFilters = new Set();
    this.wasmExecutablePathNoticed = false;
    this.wasmFailureNotifier = new WasmFailureNotifier();
    this.nextRunId = 0;

    // code actions
    for (const language of ShellCheckProvider.LANGUAGES) {
      context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
          language,
          this,
          ShellCheckProvider.metadata,
        ),
      );
      context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
          language,
          new FixAllProvider(),
          FixAllProvider.metadata,
        ),
      );
    }

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
          return await this.triggerLint(editor.document, "manual");
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
    this.triggerLintForEntireWorkspace("workspace-initial");
  }

  private onDidCloseTextDocument(textDocument: vscode.TextDocument) {
    // Paired with the open record, this is what shows a document that
    // something keeps reopening.
    if (this.isAllowedTextDocument(textDocument)) {
      logging.debug(
        "document closed: %s (scheme=%s, language=%s)",
        textDocument.uri.toString(),
        textDocument.uri.scheme,
        textDocument.languageId,
      );
    }
    this.setResultCollections(textDocument.uri);
    this.runtimeManager.cancel(textDocument.uri.toString());
    this.settingsByUri.delete(textDocument.uri.toString());
    delete this.delayers[textDocument.uri.toString()];
  }

  private onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
    if (!checkIfConfigurationChanged(e)) {
      return;
    }

    this.settingsByUri.clear();
    this.toolStatusByPath.clear();
    this.wasmExecutablePathNoticed = false;
    this.runtimeManager.refresh();

    // Shellcheck all open shell documents
    this.triggerLintForEntireWorkspace("config-change");
  }

  private async onDidOpenTextDocument(textDocument: vscode.TextDocument) {
    if (this.isAllowedTextDocument(textDocument)) {
      logging.debug(
        "document opened: %s (scheme=%s, language=%s)",
        textDocument.uri.toString(),
        textDocument.uri.scheme,
        textDocument.languageId,
      );
    }
    try {
      await this.triggerLint(textDocument, "open");
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
        "change",
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
        "save",
        (settings) => settings.trigger === RunTrigger.onSave,
      );
    } catch (error) {
      logging.error(`onDidSaveTextDocument ${error}`);
    }
  }

  private async triggerLintForEntireWorkspace(trigger: LintTrigger) {
    for await (const textDocument of vscode.workspace.textDocuments) {
      try {
        await this.triggerLint(textDocument, trigger);
      } catch (error) {
        logging.error(`triggerLintForEntireWorkspace: ${error}`);
      }
    }
  }

  public dispose(): void {
    this.codeActionCollection.clear();
    this.diagnosticCollection.dispose();
  }

  public getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] {
    return this.diagnosticCollection.get(uri) ?? [];
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

    if (settings.runtime === "wasm") {
      this.reportWasmLimitations(textDocument, settings);
    }

    if (isOutOfNativeReach(textDocument, settings)) {
      // Not even the version probe: it would spawn a program for a document
      // it cannot lint.
      logging.info(
        'shellcheck: %s belongs to a virtual workspace, which only shellcheck.runtime "wasm" can lint',
        textDocument.uri.toString(),
      );
      return;
    }

    const statusKey = toolStatusKey(settings);
    if (settings.enabled && !this.toolStatusByPath.has(statusKey)) {
      if (settings.runtime === "wasm") {
        // The module is bundled, so its version is known without probing it,
        // and there is nothing the user could update. Imported on demand, as
        // a static import would load the package in every native session.
        const { SHELLCHECK_VERSION, BUILD_INFO } =
          await import("@vscode-shellcheck/shellcheck-wasm");
        const version = new SemVer(SHELLCHECK_VERSION);
        this.toolStatusByPath.set(statusKey, {
          ok: true,
          version,
          ghcVersion: BUILD_INFO.ghcVersion,
        });
        logging.info(`shellcheck (wasm) version: ${version}`);
        return;
      }

      // Prompt user to update shellcheck binary when necessary
      let toolStatus: ToolStatus;
      try {
        toolStatus = {
          ok: true,
          version: await getToolVersion(settings.executable.path),
        };
      } catch (error: any) {
        logging.debug("Failed to get tool version: %O", error);
        this.showShellCheckError(error, settings.runtime);
        toolStatus = toolStatusByError(error);
      }
      this.toolStatusByPath.set(statusKey, toolStatus);

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

  /** What the wasm sandbox silently cannot honour, on the settings it sees. */
  private reportWasmLimitations(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings,
  ): void {
    if (!this.wasmExecutablePathNoticed) {
      const configuredPath = vscode.workspace
        .getConfiguration("shellcheck", textDocument)
        .get<string>(ShellCheckSettings.keys.executablePath);
      if (configuredPath) {
        this.wasmExecutablePathNoticed = true;
        logging.info(
          'shellcheck.executablePath is ignored while shellcheck.runtime is "wasm"',
        );
      }
    }

    if (textDocument.isUntitled) {
      logging.info(
        "shellcheck (wasm): %s has no folder to expose, so `.shellcheckrc` and `source` will not resolve for it",
        textDocument.uri.toString(),
      );
    }

    for (const arg of settings.customArgs) {
      if (hasHostAbsolutePath(arg)) {
        logging.warn(
          "shellcheck (wasm): the custom argument `%s` names a host path, which the sandbox does not expose under that name",
          arg,
        );
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
      apiVersion1: { registerDocumentFilter: this.registerDocumentFilter },
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
    this.triggerLintForEntireWorkspace("document-filter-registered");

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
      ...ShellCheckProvider.LANGUAGES,
      ...this.additionalDocumentFilters,
    ];
    return !!vscode.languages.match(allowedDocumentSelector, textDocument);
  }

  private async collectDiagnostics(textDocument: vscode.TextDocument) {
    const { uri } = textDocument;
    const output: string[] = [
      "# ShellCheck Diagnostics Report\n",
      "## Document\n",
      `- URI: \`${uri.toString()}\``,
      `- Scheme: \`${uri.scheme}\``,
      `- Language: \`${textDocument.languageId}\``,
      "",
    ];

    const { extension } = this.context;
    output.push(
      "## Environment\n",
      `- Extension: \`${extension.id} ${extension.packageJSON.version}\``,
      `- Editor: \`${vscode.env.appName} ${vscode.version}\` (host: \`${vscode.env.appHost}\`, remote: \`${vscode.env.remoteName ?? "none"}\`, UI: \`${vscode.UIKind[vscode.env.uiKind]}\`)`,
      `- Platform: \`${process.platform} ${process.arch}\``,
      `- Workspace: ${vscode.workspace.workspaceFolders?.length ?? 0} folder(s), virtual: \`${isVirtualWorkspace()}\`, trusted: \`${vscode.workspace.isTrusted}\``,
      "",
    );

    output.push("## ShellCheck\n");
    const settings: ShellCheckSettings = await this.getSettings(textDocument);
    const toolStatus = this.toolStatusByPath.get(toolStatusKey(settings));
    if (toolStatus && toolStatus.ok) {
      if (settings.runtime === "wasm") {
        output.push(
          `- Runtime: \`wasm (ShellCheck ${toolStatus.version}, GHC ${toolStatus.ghcVersion})\``,
        );
      } else {
        output.push(
          `- Runtime: \`${settings.runtime}\``,
          `- Version: \`${toolStatus.version}\``,
          `- Bundled: \`${settings.executable.bundled}\``,
        );
      }
    } else {
      output.push("- ShellCheck is not installed or not working");
    }
    output.push(
      `- Active runner: \`${this.runtimeManager.kind ?? "none"}\``,
      "",
    );

    output.push(...this.describeSettings(textDocument, settings));

    const warnings: string[] = [];
    if (!this.isAllowedTextDocument(textDocument)) {
      warnings.push("- Document is not a shell script or is filtered out");
    }

    if (settings.ignoreFileSchemes.has(textDocument.uri.scheme)) {
      warnings.push(
        `- File scheme of document is ignored: ${textDocument.uri.scheme} not in \`shellcheck.ignoreFileSchemes\``,
      );
    }

    if (isOutOfNativeReach(textDocument, settings)) {
      warnings.push(
        '- Document belongs to a virtual workspace, which only `shellcheck.runtime` `"wasm"` can lint',
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
      if (bashIdeSection.get<string>("shellcheckPath") !== "") {
        output.push(
          "## Notes about Bash IDE extension\n",
          "- Bash IDE also provides ShellCheck integration, which overlaps with the ShellCheck extension. To disable ShellCheck integration in Bash IDE, set `bashIde.shellcheckPath` to an empty string.",
        );
        output.push("");
      }
    }

    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: output.join("\n"),
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /** The effective settings, never the document or environment variables. */
  private describeSettings(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings,
  ): string[] {
    const section = vscode.workspace.getConfiguration(
      "shellcheck",
      textDocument,
    );
    const entry = (key: string, value: unknown) =>
      `- \`shellcheck.${key}\`: \`${JSON.stringify(value)}\``;
    const { keys } = ShellCheckSettings;
    return [
      "## Settings\n",
      entry(keys.enable, settings.enabled),
      entry(keys.runtime, settings.runtime),
      entry(keys.run, RunTrigger[settings.trigger]),
      `${entry(keys.executablePath, settings.executable.path)} (bundled: \`${settings.executable.bundled}\`)`,
      entry(keys.exclude, settings.exclude),
      entry(keys.customArgs, settings.customArgs),
      entry(keys.ignoreFileSchemes, [...settings.ignoreFileSchemes]),
      entry(keys.ignorePatterns, section.get(keys.ignorePatterns, {})),
      entry(keys.useWorkspaceRootAsCwd, settings.useWorkspaceRootAsCwd),
      entry(keys.enableQuickFix, settings.enableQuickFix),
      entry("logLevel", section.get("logLevel")),
      "",
    ];
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
    trigger: LintTrigger,
    extraCondition: (settings: ShellCheckSettings) => boolean = (_) => true,
  ) {
    const key = textDocument.uri.toString();
    if (!this.isAllowedTextDocument(textDocument)) {
      // Every keystroke in any other document gets here.
      logging.trace(
        "skip [%s] %s: language %s is not linted (scheme=%s)",
        trigger,
        key,
        textDocument.languageId,
        textDocument.uri.scheme,
      );
      return;
    }

    logging.debug(
      "trigger [%s] %s (scheme=%s, language=%s)",
      trigger,
      key,
      textDocument.uri.scheme,
      textDocument.languageId,
    );

    const settings: ShellCheckSettings = await this.getSettings(textDocument);
    if (!extraCondition(settings)) {
      logging.debug(
        "skip [%s] %s: shellcheck.run is %s",
        trigger,
        key,
        RunTrigger[settings.trigger],
      );
      return;
    }
    if (isOutOfNativeReach(textDocument, settings)) {
      logging.debug(
        'skip [%s] %s: virtual workspace documents need shellcheck.runtime "wasm"',
        trigger,
        key,
      );
      return;
    }
    const toolStatus = this.toolStatusByPath.get(toolStatusKey(settings));
    if (!toolStatus?.ok) {
      // A disabled document never has its tool probed.
      if (!settings.enabled) {
        logging.debug("skip [%s] %s: shellcheck.enable is false", trigger, key);
      } else {
        logging.debug(
          "skip [%s] %s: shellcheck is unavailable (%s)",
          trigger,
          key,
          toolStatus?.reason ?? "not checked",
        );
      }
      return;
    }
    if (settings.ignoreFileSchemes.has(textDocument.uri.scheme)) {
      logging.debug(
        "skip [%s] %s: scheme %s is in shellcheck.ignoreFileSchemes",
        trigger,
        key,
        textDocument.uri.scheme,
      );
      return;
    }

    if (!settings.enabled) {
      logging.debug("skip [%s] %s: shellcheck.enable is false", trigger, key);
      this.setResultCollections(textDocument.uri);
      return;
    }

    if (
      settings.fileMatcher.excludes(
        textDocument.fileName,
        getWorkspaceFolderPath(textDocument.uri, false),
      )
    ) {
      logging.debug(
        "skip [%s] %s: excluded by shellcheck.ignorePatterns",
        trigger,
        key,
      );
      return;
    }

    let delayer = this.delayers[key];
    const created = !delayer;
    if (!delayer) {
      delayer = new ThrottledDelayer<void>(
        settings.trigger === RunTrigger.onType ? 250 : 0,
      );
      this.delayers[key] = delayer;
    }

    // Per call, not per delayer: the delayers outlive a configuration change,
    // so a delay baked in at creation would survive a runtime switch.
    const delay = lintDelay(settings);
    logging.debug(
      "queue [%s] %s: lint in %d ms (new delayer=%s, replaces pending=%s)",
      trigger,
      key,
      delay,
      created,
      delayer.isTriggered(),
    );
    delayer.trigger(() => this.runLint(textDocument, settings, trigger), delay);
  }

  private async runLint(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings,
    trigger: LintTrigger,
  ): Promise<void> {
    const runId = ++this.nextRunId;
    const key = textDocument.uri.toString();
    logging.debug(
      "lint #%d start: %s (trigger=%s, runtime=%s)",
      runId,
      key,
      trigger,
      settings.runtime,
    );
    const statusKey = toolStatusKey(settings);
    const toolStatus = this.toolStatusByPath.get(statusKey);
    if (!toolStatus) {
      // The configuration changed while this run sat in the delayer, which
      // dropped the tool status it was queued against. Every open document is
      // re-linted on that change, so there is nothing to salvage here.
      logging.debug("lint #%d stale: the configuration changed", runId);
      return;
    }
    if (!toolStatus.ok) {
      logging.debug("lint #%d failed: %s", runId, toolStatus.reason);
      return Promise.reject(toolStatus.reason);
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
    const fileExt = extname(textDocument.fileName);
    if (fileExt === ".bash" || fileExt === ".ksh" || fileExt === ".dash") {
      // shellcheck args: specify dialect (sh, bash, dash, ksh)
      args = args.concat(["-s", fileExt.substring(1)]);
    }

    if (settings.customArgs.length) {
      args = args.concat(settings.customArgs);
    }

    args.push("-"); // Use stdin for shellcheck

    let lintResult: LintResult;
    try {
      const runner = await this.runtimeManager.getRunner();
      // The wasm runtime reads every file through workspace.fs, so it takes
      // no host path at all.
      const { cwd, mount } =
        settings.runtime === "wasm"
          ? {
              cwd: undefined,
              mount: await resolveDocumentMount(
                textDocument.uri,
                settings.useWorkspaceRootAsCwd,
              ),
            }
          : { cwd: await this.nativeWorkingDirectory(textDocument, settings) };
      lintResult = await runner.run({
        documentKey: key,
        runId,
        executablePath: executable.path,
        args,
        stdin: textDocument.getText(),
        cwd,
        mount,
      });
    } catch (error: any) {
      if (
        error instanceof RunnerDisposedError ||
        error instanceof RunSupersededError
      ) {
        // A newer run, or a newer runtime, owns this document now.
        logging.debug("lint #%d dropped: %s", runId, error.message);
        return;
      }
      logging.debug("lint #%d failed: %O", runId, error);
      if (error instanceof WasmRuntimeError) {
        // Never falls back to native: a silent switch of runtimes would hide
        // which one produced the diagnostics on screen.
        this.showWasmRuntimeError(error);
        return;
      }
      this.showShellCheckError(error, settings.runtime);
      this.toolStatusByPath.set(statusKey, toolStatusByError(error));
      return;
    }

    let result: ParseResult[] | null = null;
    logging.trace("lint #%d response: %s", runId, lintResult.stdout);
    if (lintResult.stderr.length) {
      logging.trace("lint #%d stderr: %s", runId, lintResult.stderr);
    }
    if (lintResult.stdout.length) {
      result = parser.parse(lintResult.stdout);
    }
    if (textDocument.isClosed) {
      // The run outlived its document, whose diagnostics the close handler
      // already cleared.
      logging.debug("lint #%d discarded: the document was closed", runId);
      return;
    }
    this.setResultCollections(textDocument.uri, result);
    logging.debug(
      "lint #%d done: %d diagnostic(s)",
      runId,
      result?.length ?? 0,
    );
  }

  private async nativeWorkingDirectory(
    textDocument: vscode.TextDocument,
    settings: ShellCheckSettings,
  ): Promise<string | undefined> {
    return await ensureCurrentWorkingDirectory(
      settings.useWorkspaceRootAsCwd
        ? getWorkspaceFolderPath(textDocument.uri)
        : guessDocumentDirname(textDocument),
    );
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

  private async showShellCheckError(
    err: unknown,
    runtime: RuntimeKind,
  ): Promise<void> {
    await this.showFailureNotification(describeShellCheckError(err, runtime));
  }

  /** The wasm runtime never falls back to the native program, so the failure is
   * always logged but only shown once a session. */
  private async showWasmRuntimeError(error: WasmRuntimeError): Promise<void> {
    logging.error(
      "ShellCheck (wasm) failed: %s\n%s",
      error.message,
      error.detail,
    );
    const notification = this.wasmFailureNotifier.notificationFor(error);
    if (notification) {
      await this.showFailureNotification(notification);
    }
  }

  private async showFailureNotification(
    notification: FailureNotification,
  ): Promise<void> {
    try {
      const selected = await vscode.window.showErrorMessage(
        notification.message,
        ...notification.items,
      );
      await applyFailureEffect(
        effectOfSelection(selected),
        this.failureActionHost,
      );
    } catch (error) {
      // Nobody awaits a notification, so a rejection here would go nowhere.
      logging.error("Unable to report a ShellCheck failure: %O", error);
    }
  }

  private readonly failureActionHost: FailureActionHost = {
    openUrl: async (url) => {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    },
    showLog: () => {
      this.revealLog();
    },
    setRuntime: async (runtime) => {
      await vscode.workspace
        .getConfiguration("shellcheck")
        .update(
          ShellCheckSettings.keys.runtime,
          runtime,
          vscode.ConfigurationTarget.Global,
        );
    },
  };
}
