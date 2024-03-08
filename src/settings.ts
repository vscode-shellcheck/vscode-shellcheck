import * as fs from "node:fs";
import * as vscode from "vscode";
import { FileMatcher, FileSettings } from "./utils/filematcher";
import { substitutePath } from "./utils/path";

export interface Executable {
  path: string;
  bundled: boolean;
}

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

const validErrorCodePattern = /^(SC)?(\d{4})$/;

export async function getWorkspaceSettings(
  context: vscode.ExtensionContext,
  scope?: vscode.ConfigurationScope | null,
): Promise<ShellCheckSettings> {
  const keys = ShellCheckSettings.keys;
  const section = vscode.workspace.getConfiguration("shellcheck", scope);
  const settings = <ShellCheckSettings>{
    enabled: section.get(keys.enable, true),
    trigger: RunTrigger.from(section.get(keys.run, RunTrigger.strings.onType)),
    exclude: section.get(keys.exclude, []),
    executable: await getExecutable(context, section.get(keys.executablePath)),
    customArgs: section
      .get(keys.customArgs, [])
      .map((arg) => substitutePath(arg)),
    ignoreFileSchemes: new Set(
      section.get(keys.ignoreFileSchemes, ["git", "gitfs", "output"]),
    ),
    useWorkspaceRootAsCwd: section.get(keys.useWorkspaceRootAsCwd, false),
    enableQuickFix: section.get(keys.enableQuickFix, false),
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

async function getExecutable(
  context: vscode.ExtensionContext,
  executablePath: string | undefined,
): Promise<Executable> {
  if (!executablePath) {
    // Use bundled binaries (maybe)
    const suffix = process.platform === "win32" ? ".exe" : "";
    executablePath = context.asAbsolutePath(
      `./binaries/${process.platform}/${process.arch}/shellcheck${suffix}`,
    );
    try {
      await fs.promises.access(executablePath, fs.constants.X_OK);
      return {
        path: executablePath,
        bundled: true,
      };
    } catch (error) {
      return {
        path: "shellcheck", // Fallback to default shellcheck path.
        bundled: false,
      };
    }
  }

  return {
    path: substitutePath(executablePath),
    bundled: false,
  };
}
