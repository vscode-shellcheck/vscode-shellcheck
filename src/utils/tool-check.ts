import { execa } from "execa";
import { SemVer, lt as semVerLt, parse as semVerParse } from "semver";
import * as vscode from "vscode";
import { version as BUNDLED_TOOL_VERSION } from "../../bindl.config.js";
import * as logging from "./logging/index.js";

/** Once a session: every change of a `shellcheck.*` setting probes again. */
const promptedVersions = new Set<string>();

export function tryPromptForUpdatingTool(version: SemVer) {
  const disableVersionCheckUpdateSetting =
    new DisableVersionCheckUpdateSetting();
  if (!disableVersionCheckUpdateSetting.isDisabled) {
    if (
      semVerLt(version, BUNDLED_TOOL_VERSION) &&
      !promptedVersions.has(version.format())
    ) {
      promptedVersions.add(version.format());
      promptForUpdatingTool(version.format(), disableVersionCheckUpdateSetting);
    }
  }
}

export function parseToolVersion(s: string): SemVer {
  const match = s.match(/version: v?((?:\d+)\.(?:\d+)(?:\.\d+)*)/);
  if (!match || match.length < 2) {
    throw new Error(`Unexpected response from ShellCheck: ${s}`);
  }
  const version: SemVer | null = semVerParse(match[1]);
  if (!version) {
    throw new Error(`Unable to parse ShellCheck version: ${match[1]}`);
  }
  return version;
}

export async function getToolVersion(executable: string): Promise<SemVer> {
  logging.debug(`Spawn: ${executable} -V`);
  const { stdout } = await execa(executable, ["-V"], { timeout: 5000 });

  return parseToolVersion(stdout);
}

async function promptForUpdatingTool(
  currentVersion: string,
  disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting,
) {
  const neverShow = { title: vscode.l10n.t("Don't Show Again") };
  const update = { title: vscode.l10n.t("Update") };
  const selected = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      'The ShellCheck extension is better with a newer version of "shellcheck" (you got v{0}, v{1} or newer is recommended)',
      currentVersion,
      BUNDLED_TOOL_VERSION,
    ),
    neverShow,
    update,
  );
  switch (selected) {
    case neverShow:
      disableVersionCheckUpdateSetting.persist();
      break;
    case update:
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
