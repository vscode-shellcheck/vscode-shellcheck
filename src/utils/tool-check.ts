import * as semver from "semver";
import * as vscode from "vscode";
import * as execa from "execa";
import * as logging from "./logging";
import { shellcheckVersion } from "../../package.json";

export const BEST_TOOL_VERSION = shellcheckVersion;

export function tryPromptForUpdatingTool(version: semver.SemVer) {
  const disableVersionCheckUpdateSetting =
    new DisableVersionCheckUpdateSetting();
  if (!disableVersionCheckUpdateSetting.isDisabled) {
    if (semver.lt(version, BEST_TOOL_VERSION)) {
      promptForUpdatingTool(version.format(), disableVersionCheckUpdateSetting);
    }
  }
}

export function parseToolVersion(s: string): semver.SemVer {
  const match = s.match(/version: v?((?:\d+)\.(?:\d+)(?:\.\d+)*)/);
  if (!match || match.length < 2) {
    throw new Error(`Unexpected response from ShellCheck: ${s}`);
  }
  const version: semver.SemVer | null = semver.parse(match[1]);
  if (!version) {
    throw new Error(`Unable to parse ShellCheck version: ${match[1]}`);
  }
  return version;
}

export function getToolVersion(executable: string): semver.SemVer {
  logging.debug(`Spawn: ${executable} -V`);
  const { stdout } = execa.sync(executable, ["-V"], { timeout: 5000 });

  return parseToolVersion(stdout);
}

async function promptForUpdatingTool(
  currentVersion: string,
  disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting,
) {
  const selected = await vscode.window.showInformationMessage(
    `The vscode-shellcheck extension is better with a newer version of "shellcheck" (You got v${currentVersion}, v${BEST_TOOL_VERSION} or newer is recommended)`,
    "Don't Show Again",
    "Update",
  );
  switch (selected) {
    case "Don't Show Again":
      disableVersionCheckUpdateSetting.persist();
      break;
    case "Update":
      vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/koalaman/shellcheck#installing"),
      );
      break;
  }
}

export class DisableVersionCheckUpdateSetting {
  private static KEY = "disableVersionCheck";
  private config: vscode.WorkspaceConfiguration;
  readonly isDisabled: boolean;

  constructor() {
    this.config = vscode.workspace.getConfiguration("shellcheck", null);
    this.isDisabled =
      this.config.get(DisableVersionCheckUpdateSetting.KEY) || false;
  }

  persist() {
    this.config.update(DisableVersionCheckUpdateSetting.KEY, true, true);
  }
}
