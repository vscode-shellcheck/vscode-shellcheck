import * as semver from 'semver';
import * as vscode from 'vscode';
import * as execa from 'execa';

export const BEST_TOOL_VERSION = '0.7.1';

export function tryPromptForUpdatingTool(version: semver.SemVer | null) {
    if (!version) {
        return;
    }

    const disableVersionCheckUpdateSetting = new DisableVersionCheckUpdateSetting();
    if (!disableVersionCheckUpdateSetting.isDisabled) {
        if (semver.lt(version, BEST_TOOL_VERSION)) {
            promptForUpdatingTool(version.format(), disableVersionCheckUpdateSetting);
        }
    }
}

export async function getToolVersion(executable: string): Promise<semver.SemVer | null> {

    const { stdout } = await execa(executable, ['-V'], { timeout: 2000 });

    const matches = /version: ((?:\d+)\.(?:\d+)(?:\.\d+)*)/.exec(stdout);
    if (matches && matches[1]) {
        return semver.parse(matches[1]);
    }

    return null;
}

async function promptForUpdatingTool(currentVersion: string, disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting) {
    const selected = await vscode.window.showInformationMessage(`The vscode-shellcheck extension is better with a newer version of "shellcheck" (You got v${currentVersion}, v${BEST_TOOL_VERSION} or newer is recommended)`, 'Don\'t Show Again', 'Update');
    switch (selected) {
        case 'Don\'t Show Again':
            disableVersionCheckUpdateSetting.persist();
            break;
        case 'Update':
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/koalaman/shellcheck#installing'));
            break;
    }
}

export class DisableVersionCheckUpdateSetting {

    private static KEY = 'disableVersionCheck';
    private config: vscode.WorkspaceConfiguration;
    readonly isDisabled: boolean;

    constructor() {
        this.config = vscode.workspace.getConfiguration('shellcheck', null);
        this.isDisabled = this.config.get(DisableVersionCheckUpdateSetting.KEY) || false;
    }

    persist() {
        this.config.update(DisableVersionCheckUpdateSetting.KEY, true, true);
    }
}
