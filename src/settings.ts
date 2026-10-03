import * as vscode from "vscode";
import { nativeRuntime } from "./runtime/native.js";
import { Executable, RuntimeKind } from "./runtime/types.js";
import { FileMatcher, FileSettings } from "./utils/filematcher.js";
import { substitutePath } from "./utils/path.js";

export interface ShellCheckSettings {
  enabled: boolean;
  enableQuickFix: boolean;
  executable: Executable;
  trigger: RunTrigger;
  exclude: string[];
  customArgs: string[];
  ignoreFileSchemes: Set<string>;
  useWorkspaceRootAsCwd: boolean;
  fileMatcher: FileMatcher;
  runtime: RuntimeKind;
  /** Seconds; 0 for no limit. */
  runTimeout: number;
}

export namespace ShellCheckSettings {
  export const keys = {
    enable: "enable",
    enableQuickFix: "enableQuickFix",
    executablePath: "executablePath",
    run: "run",
    exclude: "exclude",
    customArgs: "customArgs",
    ignorePatterns: "ignorePatterns",
    ignoreFileSchemes: "ignoreFileSchemes",
    useWorkspaceRootAsCwd: "useWorkspaceRootAsCwd",
    runtime: "runtime",
    runTimeout: "runTimeout",
    watchConfigFiles: "watchConfigFiles",
  };
}

export enum RunTrigger {
  onSave,
  onType,
  manual,
}

export namespace RunTrigger {
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

/** Where there is no native runtime (the web), wasm whatever the setting says. */
export function getRuntimeKind(
  section: vscode.WorkspaceConfiguration,
): RuntimeKind {
  return nativeRuntime &&
    section.get(ShellCheckSettings.keys.runtime) !== "wasm"
    ? "native"
    : "wasm";
}

/** Window scoped; 0 means no limit. */
export function getMaxConcurrentRuns(): number {
  const value = vscode.workspace
    .getConfiguration("shellcheck")
    .get("maxConcurrentRuns", 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

const validErrorCodePattern = /^(SC)?(\d{4})$/;

export async function getWorkspaceSettings(
  context: vscode.ExtensionContext,
  scope?: vscode.ConfigurationScope | null,
): Promise<ShellCheckSettings> {
  const keys = ShellCheckSettings.keys;
  const section = vscode.workspace.getConfiguration("shellcheck", scope);
  const runtime = getRuntimeKind(section);
  const settings = <ShellCheckSettings>{
    enabled: section.get(keys.enable, true),
    trigger: RunTrigger.from(section.get(keys.run, RunTrigger.strings.onType)),
    exclude: section.get(keys.exclude, []),
    runtime,
    // The wasm runtime has no executable, and looking one up would probe the
    // bundled binaries for nothing.
    executable:
      runtime === "wasm"
        ? { path: "", bundled: false }
        : await nativeRuntime!.resolveExecutable(
            context,
            section.get(keys.executablePath),
          ),
    customArgs: section
      .get(keys.customArgs, [])
      .map((arg) => substitutePath(arg)),
    ignoreFileSchemes: new Set(
      section.get(keys.ignoreFileSchemes, [
        "git",
        "gitfs",
        "output",
        "review",
        "pr",
        "githubpr",
        "gitpr",
        "githubcommit",
      ]),
    ),
    useWorkspaceRootAsCwd: section.get(keys.useWorkspaceRootAsCwd, false),
    enableQuickFix: section.get(keys.enableQuickFix, false),
    runTimeout: section.get(keys.runTimeout, 0),
    fileMatcher: new FileMatcher(),
  };

  // Filter excludes (#739), besides, tolerate error codes prefixed with "SC"
  settings.exclude = settings.exclude.reduce<string[]>((acc, pattern) => {
    const m = pattern.match(validErrorCodePattern);
    if (m) {
      acc.push(m[2]);
    }
    return acc;
  }, []);

  const ignorePatterns: FileSettings = section.get(keys.ignorePatterns, {});
  settings.fileMatcher.configure(ignorePatterns);
  return settings;
}

export function checkIfConfigurationChanged(
  e: vscode.ConfigurationChangeEvent,
): boolean {
  for (const key in ShellCheckSettings.keys) {
    const section = `shellcheck.${key}`;
    if (e.affectsConfiguration(section)) {
      return true;
    }
  }
  return false;
}
