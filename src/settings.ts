import * as fs from "fs";
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

export function getWorkspaceSettings(
  context: vscode.ExtensionContext,
  scope?: vscode.ConfigurationScope | null
): ShellCheckSettings {
  const keys = ShellCheckSettings.keys;
  const section = vscode.workspace.getConfiguration("shellcheck", scope);
  const settings = <ShellCheckSettings>{
    enabled: section.get(keys.enable, true),
    trigger: RunTrigger.from(section.get(keys.run, RunTrigger.strings.onType)),
    executable: getExecutable(context, section.get(keys.executablePath, "")),
    exclude: section.get(keys.exclude, []),
    customArgs: section
      .get(keys.customArgs, [])
      .map((arg) => substitutePath(arg)),
    ignoreFileSchemes: new Set(
      section.get(keys.ignoreFileSchemes, ["git", "gitfs", "output"])
    ),
    useWorkspaceRootAsCwd: section.get(keys.useWorkspaceRootAsCwd, false),
    enableQuickFix: section.get(keys.enableQuickFix, false),
    fileMatcher: new FileMatcher(),
  };

  const ignorePatterns: FileSettings = section.get(keys.ignorePatterns, {});
  settings.fileMatcher.configure(ignorePatterns);
  return settings;
}

export function checkIfConfigurationChanged(
  e: vscode.ConfigurationChangeEvent
): boolean {
  for (const key in ShellCheckSettings.keys) {
    const section = `shellcheck.${key}`;
    if (e.affectsConfiguration(section)) {
      return true;
    }
  }
  return false;
}

function getExecutable(
  context: vscode.ExtensionContext,
  executablePath: string
): Executable {
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
    executablePath = context.asAbsolutePath(
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
