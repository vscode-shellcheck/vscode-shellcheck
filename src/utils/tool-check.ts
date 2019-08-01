import * as child_process from 'child_process';
import * as semver from 'semver';
import * as vscode from 'vscode';
import * as wsl from './wslSupport';


const BEST_TOOL_VERSION = '0.4.7';

export async function checkTool(useWSL: boolean, executable: string) {
    const disableVersionCheckUpdateSetting = new DisableVersionCheckUpdateSetting();
    if (!disableVersionCheckUpdateSetting.isDisabled) {
        // Check tool version
        const toolVersion = await getToolVersion(useWSL, executable);
        if (!toolVersion) {
            return;
        }

        if (semver.lt(toolVersion, BEST_TOOL_VERSION)) {
            promptForUpdatingTool(toolVersion.format(), disableVersionCheckUpdateSetting);
        }
    }
}

async function getToolVersion(useWSL: boolean, executable: string): Promise<semver.SemVer | null> {
    return new Promise<semver.SemVer | null>((resolve, reject) => {
        const launchArgs = wsl.createLaunchArg(useWSL, false, undefined, executable, ['-V']);
        child_process.execFile(launchArgs.executable, launchArgs.args, { timeout: 2000 }, (err, stdout, stderr) => {
            const matches = /version: ((?:\d+)\.(?:\d+)(?:\.\d+)*)/.exec(stdout);
            if (matches) {
                const ver = semver.parse(matches[1]);
                resolve(ver);
            } else {
                resolve(null);
            }
        });
    });
}

async function promptForUpdatingTool(currentVersion: string, disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting) {
    const selected = await vscode.window.showInformationMessage(`The vscode-shellcheck extension is better with newer version of "shellcheck" (You got v${currentVersion}, v${BEST_TOOL_VERSION} or better is recommended)`, 'Don\'t Show Again', 'Update');
    switch (selected) {
        case 'Don\'t Show Again':
            disableVersionCheckUpdateSetting.persist();
            break;
        case 'Update':
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/koalaman/shellcheck#installing'));
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
