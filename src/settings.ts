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
  ignorePatterns: FileSettings;
  ignoreFileSchemes: Set<string>;
  useWorkspaceRootAsCwd: boolean;
  fileMatcher: FileMatcher;
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
  const section = vscode.workspace.getConfiguration("shellcheck", scope);
  const settings = <ShellCheckSettings>{
    enabled: section.get("enable", true),
    trigger: RunTrigger.from(section.get("run", RunTrigger.strings.onType)),
    executable: getExecutable(context, section.get("executablePath", "")),
    exclude: section.get("exclude", []),
    customArgs: section.get("customArgs", []).map((arg) => substitutePath(arg)),
    ignorePatterns: section.get("ignorePatterns", {}),
    ignoreFileSchemes: new Set(
      section.get("ignoreFileSchemes", ["git", "gitfs", "output"])
    ),
    useWorkspaceRootAsCwd: section.get("useWorkspaceRootAsCwd", false),
    enableQuickFix: section.get("enableQuickFix", false),
    fileMatcher: new FileMatcher(),
  };

  settings.fileMatcher.configure(settings.ignorePatterns);
  return settings;
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
