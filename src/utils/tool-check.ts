import * as semver from "semver";
import * as vscode from "vscode";
import execa from "execa";
import * as logging from "./logging";

export const MINIMUM_TOOL_VERSION = "0.7.0";

export function tryPromptForUpdatingTool(version: semver.SemVer) {
  const disableVersionCheckUpdateSetting =
    new DisableVersionCheckUpdateSetting();
  if (!disableVersionCheckUpdateSetting.isDisabled) {
    if (semver.lt(version, MINIMUM_TOOL_VERSION)) {
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

export async function getToolVersion(
  executable: string,
): Promise<semver.SemVer> {
  logging.debug(`Spawn: ${executable} -V`);
  const { stdout } = await execa(executable, ["-V"], { timeout: 5000 });

  return parseToolVersion(stdout);
}

async function promptForUpdatingTool(
  currentVersion: string,
  disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting,
) {
  const selected = await vscode.window.showInformationMessage(
    `The ShellCheck extension is better with a newer version of "shellcheck" (you got v${currentVersion}, v${MINIMUM_TOOL_VERSION} or newer is recommended)`,
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
