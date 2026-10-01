import * as vscode from "vscode";
import type { ToolStatus } from "./linter.js";
import { RuntimeKind } from "./runtime/types.js";
import { RunTrigger, ShellCheckSettings } from "./settings.js";

const SHOW_MENU_COMMAND = "shellcheck.showMenu";
const ICON = "$(shellcheck-logo)";

/** What the status bar and its menu show for the active document. */
export interface StatusSnapshot {
  readonly runtime: RuntimeKind;
  /** False on the web, which only has the wasm runtime. */
  readonly canSwitchRuntime: boolean;
  readonly enabled: boolean;
  readonly trigger: RunTrigger;
  readonly bundled: boolean;
  /** Undefined until the version has been probed, which a disabled document
   * never does. */
  readonly tool: ToolStatus | undefined;
}

export interface StatusBarView {
  readonly text: string;
  readonly tooltip: string;
  /** ShellCheck cannot run at all. */
  readonly problem: boolean;
}

export type MenuAction =
  | { readonly kind: "command"; readonly command: string }
  | { readonly kind: "setRuntime"; readonly runtime: RuntimeKind }
  | { readonly kind: "setEnabled"; readonly enabled: boolean }
  | { readonly kind: "pickTrigger" }
  | { readonly kind: "openSettings" }
  | { readonly kind: "showOutput" };

export interface MenuItem extends vscode.QuickPickItem {
  readonly action?: MenuAction;
}

/** Where the active document's status comes from. */
export interface StatusSource {
  /** Fires with the URI of a document whose status may have changed. */
  readonly onDidChangeStatus: vscode.Event<vscode.Uri>;
  isAllowedTextDocument(document: vscode.TextDocument): boolean;
  getStatus(document: vscode.TextDocument): StatusSnapshot | undefined;
}

function describeRuntime(snapshot: StatusSnapshot): string {
  if (snapshot.runtime === "wasm") {
    return snapshot.tool?.ok && snapshot.tool.ghcVersion
      ? `wasm (GHC ${snapshot.tool.ghcVersion})`
      : "wasm";
  }
  return snapshot.bundled ? "native (bundled)" : "native";
}

function describeTool(tool: ToolStatus | undefined): string {
  if (!tool) {
    return "ShellCheck";
  }
  if (tool.ok) {
    return `ShellCheck ${tool.version}`;
  }
  return tool.reason === "executableNotFound"
    ? "ShellCheck: executable not found"
    : "ShellCheck: failed to run";
}

export function statusBarView(snapshot: StatusSnapshot): StatusBarView {
  const lines = [
    `**${describeTool(snapshot.tool)}**`,
    `Runtime: ${describeRuntime(snapshot)}`,
    `Run: ${RunTrigger[snapshot.trigger]}`,
  ];
  if (!snapshot.enabled) {
    lines.push("Disabled for this document");
  }
  return {
    text: snapshot.enabled
      ? `${ICON} ShellCheck`
      : `${ICON} ShellCheck (disabled)`,
    tooltip: lines.join("\n\n"),
    problem: snapshot.tool?.ok === false,
  };
}

export function menuItems(snapshot: StatusSnapshot): MenuItem[] {
  const separator = (label: string): MenuItem => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
  });
  const items: MenuItem[] = [];

  if (snapshot.enabled) {
    items.push({
      label: "$(play) Lint Current Document",
      action: { kind: "command", command: "shellcheck.runLint" },
    });
  }
  items.push({
    label: "$(report) Collect Diagnostics",
    detail: "Open a report on how ShellCheck sees this document",
    action: { kind: "command", command: "shellcheck.collectDiagnostics" },
  });

  items.push(separator("Settings"));
  if (snapshot.canSwitchRuntime) {
    const other: RuntimeKind = snapshot.runtime === "wasm" ? "native" : "wasm";
    items.push({
      label: `$(server-process) Runtime: ${snapshot.runtime}`,
      description: `Switch to ${other}`,
      action: { kind: "setRuntime", runtime: other },
    });
  }
  items.push({
    label: `$(zap) Run: ${RunTrigger[snapshot.trigger]}`,
    description: "Change when ShellCheck runs",
    action: { kind: "pickTrigger" },
  });
  items.push(
    snapshot.enabled
      ? {
          label: "$(circle-slash) Disable ShellCheck",
          description: "For this workspace",
          action: { kind: "setEnabled", enabled: false },
        }
      : {
          label: "$(check) Enable ShellCheck",
          description: "For this workspace",
          action: { kind: "setEnabled", enabled: true },
        },
  );

  items.push(separator(""));
  items.push(
    {
      label: "$(gear) Open Settings",
      action: { kind: "openSettings" },
    },
    {
      label: "$(output) Show Output",
      action: { kind: "showOutput" },
    },
  );
  return items;
}

/**
 * A write elsewhere than where the effective value comes from would be
 * shadowed by it and change nothing.
 */
export function settingTarget(
  inspected:
    { workspaceFolderValue?: unknown; workspaceValue?: unknown } | undefined,
  fallback: vscode.ConfigurationTarget,
  hasWorkspace: boolean,
): vscode.ConfigurationTarget {
  if (inspected?.workspaceFolderValue !== undefined) {
    return vscode.ConfigurationTarget.WorkspaceFolder;
  }
  if (inspected?.workspaceValue !== undefined) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return hasWorkspace ? fallback : vscode.ConfigurationTarget.Global;
}

async function updateSetting(
  document: vscode.TextDocument,
  key: string,
  value: unknown,
  fallback: vscode.ConfigurationTarget,
): Promise<void> {
  const section = vscode.workspace.getConfiguration("shellcheck", document);
  await section.update(
    key,
    value,
    settingTarget(
      section.inspect(key),
      fallback,
      !!vscode.workspace.workspaceFolders?.length,
    ),
  );
}

async function pickTrigger(
  current: RunTrigger,
): Promise<RunTrigger | undefined> {
  const triggers = [RunTrigger.onType, RunTrigger.onSave, RunTrigger.manual];
  const picked = await vscode.window.showQuickPick(
    triggers.map((trigger) => ({
      label: RunTrigger[trigger],
      description: trigger === current ? "$(check) current" : undefined,
      trigger,
    })),
    { title: "Run ShellCheck" },
  );
  return picked?.trigger;
}

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly source: StatusSource,
    /** Reveals the output channel owned by `activate`. */
    private readonly revealLog: () => void,
  ) {
    this.item = vscode.window.createStatusBarItem(
      "shellcheck.status",
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = "ShellCheck";
    this.item.command = SHOW_MENU_COMMAND;

    this.disposables.push(
      this.item,
      vscode.commands.registerCommand(SHOW_MENU_COMMAND, () => this.showMenu()),
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      source.onDidChangeStatus((uri) => {
        if (
          uri.toString() ===
          vscode.window.activeTextEditor?.document.uri.toString()
        ) {
          this.update();
        }
      }),
    );
    this.update();
  }

  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }

  private update(): void {
    const document = vscode.window.activeTextEditor?.document;
    const snapshot =
      document && this.source.isAllowedTextDocument(document)
        ? this.source.getStatus(document)
        : undefined;
    if (!snapshot) {
      this.item.hide();
      return;
    }

    const view = statusBarView(snapshot);
    this.item.text = view.text;
    this.item.tooltip = new vscode.MarkdownString(view.tooltip);
    this.item.backgroundColor = view.problem
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : undefined;
    this.item.show();
  }

  private async showMenu(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    const snapshot = document && this.source.getStatus(document);
    if (!document || !snapshot) {
      return;
    }

    const picked = await vscode.window.showQuickPick(menuItems(snapshot), {
      title: `${describeTool(snapshot.tool)} · ${describeRuntime(snapshot)}`,
    });
    const action = picked?.action;
    if (!action) {
      return;
    }

    const { Global, Workspace } = vscode.ConfigurationTarget;
    const keys = ShellCheckSettings.keys;
    switch (action.kind) {
      case "command":
        await vscode.commands.executeCommand(action.command);
        break;
      case "setRuntime":
        await updateSetting(document, keys.runtime, action.runtime, Global);
        break;
      case "setEnabled":
        await updateSetting(document, keys.enable, action.enabled, Workspace);
        break;
      case "pickTrigger": {
        const trigger = await pickTrigger(snapshot.trigger);
        if (trigger !== undefined) {
          await updateSetting(document, keys.run, RunTrigger[trigger], Global);
        }
        break;
      }
      case "openSettings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:timonwong.shellcheck",
        );
        break;
      case "showOutput":
        this.revealLog();
        break;
    }
  }
}
