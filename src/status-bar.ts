import * as vscode from "vscode";
import type { ToolStatus } from "./linter.js";
import { RuntimeKind } from "./runtime/types.js";
import { RunTrigger, ShellCheckSettings } from "./settings.js";

const SHOW_MENU_COMMAND = "shellcheck.showMenu";

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
  readonly tooltip: string;
  /** `problem`: ShellCheck cannot run at all. */
  readonly state: "ok" | "disabled" | "problem";
}

export type MenuAction =
  | { readonly kind: "command"; readonly command: string }
  | { readonly kind: "pickRuntime" }
  | { readonly kind: "setEnabled"; readonly enabled: boolean }
  | { readonly kind: "pickTrigger" }
  | { readonly kind: "openSettings" }
  | { readonly kind: "showOutput" };

export interface MenuItem extends vscode.QuickPickItem {
  readonly action?: MenuAction;
}

export interface Choice<T> extends vscode.QuickPickItem {
  readonly value: T;
  readonly current: boolean;
}

const triggerLabels: Record<RunTrigger, string> = {
  [RunTrigger.onType]: "On Type",
  [RunTrigger.onSave]: "On Save",
  [RunTrigger.manual]: "Manually",
};

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
    `Lint: ${triggerLabels[snapshot.trigger]}`,
  ];
  if (!snapshot.enabled) {
    lines.push("Disabled for this document");
  }
  return {
    tooltip: lines.join("\n\n"),
    state: !snapshot.enabled
      ? "disabled"
      : snapshot.tool?.ok === false
        ? "problem"
        : "ok",
  };
}

export function menuItems(snapshot: StatusSnapshot): MenuItem[] {
  const separator = (label: string): MenuItem => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
  });
  const items: MenuItem[] = [
    {
      label: "$(gear) Open Settings",
      action: { kind: "openSettings" },
    },
    {
      label: "$(output) Show Extension Log",
      action: { kind: "showOutput" },
    },
  ];

  items.push(separator("Settings"));
  if (snapshot.canSwitchRuntime) {
    items.push({
      label: `$(server-process) Runtime: ${snapshot.runtime}`,
      description: "Change how ShellCheck runs",
      action: { kind: "pickRuntime" },
    });
  }
  items.push({
    label: `$(zap) Lint: ${triggerLabels[snapshot.trigger]}`,
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

  items.push(separator(""), {
    label: "$(report) Collect Diagnostics",
    detail: "Open a report on how ShellCheck sees this document",
    action: { kind: "command", command: "shellcheck.collectDiagnostics" },
  });
  return items;
}

/**
 * A write elsewhere than where the effective value comes from would be
 * shadowed by it and change nothing.
 */
export function settingTarget(
  inspected: ReturnType<vscode.WorkspaceConfiguration["inspect"]>,
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

function choice<T>(
  value: T,
  current: T,
  label: string,
  detail: string,
): Choice<T> {
  return {
    label,
    description: value === current ? "$(check) current" : undefined,
    detail,
    value,
    current: value === current,
  };
}

export function runtimeChoices(current: RuntimeKind): Choice<RuntimeKind>[] {
  return [
    choice<RuntimeKind>(
      "native",
      current,
      "native",
      "Run the bundled or user-provided shellcheck executable",
    ),
    choice<RuntimeKind>(
      "wasm",
      current,
      "wasm",
      "Run the bundled WebAssembly build of ShellCheck (experimental, slower)",
    ),
  ];
}

export function triggerChoices(current: RunTrigger): Choice<RunTrigger>[] {
  return [
    choice(
      RunTrigger.onType,
      current,
      triggerLabels[RunTrigger.onType],
      "Lint as you type",
    ),
    choice(
      RunTrigger.onSave,
      current,
      triggerLabels[RunTrigger.onSave],
      "Lint when the document is saved",
    ),
    choice(
      RunTrigger.manual,
      current,
      triggerLabels[RunTrigger.manual],
      "Lint only with ShellCheck: Lint Current Document",
    ),
  ];
}

/** Resolves to the picked value, or undefined if dismissed or unchanged. */
async function pickChange<T>(
  choices: Choice<T>[],
  title: string,
): Promise<T | undefined> {
  const picked = await vscode.window.showQuickPick(choices, { title });
  return picked && !picked.current ? picked.value : undefined;
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
    this.item.text = "$(shellcheck-logo)";
    // The item is an icon alone, which a screen reader has no name for.
    this.item.accessibilityInformation = { label: "ShellCheck" };
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
    this.item.tooltip = new vscode.MarkdownString(view.tooltip);
    this.item.color =
      view.state === "disabled"
        ? new vscode.ThemeColor("disabledForeground")
        : undefined;
    this.item.backgroundColor =
      view.state === "problem"
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
      case "pickRuntime": {
        const runtime = await pickChange(
          runtimeChoices(snapshot.runtime),
          "ShellCheck Runtime",
        );
        if (runtime !== undefined) {
          await updateSetting(document, keys.runtime, runtime, Global);
        }
        break;
      }
      case "setEnabled":
        await updateSetting(document, keys.enable, action.enabled, Workspace);
        break;
      case "pickTrigger": {
        const trigger = await pickChange(
          triggerChoices(snapshot.trigger),
          "When to Lint",
        );
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
