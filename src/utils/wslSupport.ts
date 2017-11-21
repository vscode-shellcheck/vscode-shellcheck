// Shamelessly stolen from https://github.com/Microsoft/vscode-node-debug2/blob/master/src/wslSupport.ts
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

const isWindows = process.platform === 'win32';
const is64bit = process.arch === 'x64';

export function subsystemForLinuxPresent(): boolean {
    if (!isWindows) {
        return false;
    }

    const bashPath32bitApp = path.join(process.env['SystemRoot'], 'Sysnative', 'bash.exe');
    const bashPath64bitApp = path.join(process.env['SystemRoot'], 'System32', 'bash.exe');
    const bashPathHost = is64bit ? bashPath64bitApp : bashPath32bitApp;
    return fs.existsSync(bashPathHost);
}

function windowsPathToWSLPath(windowsPath: string): string {
    if (!isWindows || !windowsPath) {
        return undefined;
    } else if (path.isAbsolute(windowsPath)) {
        return `/mnt/${windowsPath.substr(0, 1).toLowerCase()}/${windowsPath.substr(3).replace(/\\/g, '/')}`;
    } else {
        return windowsPath.replace(/\\/g, '/');
    }
}

interface ILaunchArgs {
    cwd: string;
    executable: string;
    args: string[];
    combined: string[];
    localRoot?: string;
    remoteRoot?: string;
}

function createLaunchArg(useSubsytemLinux: boolean | undefined, useExternalConsole: boolean, cwd: string | undefined, executable: string, args?: string[], program?: string): ILaunchArgs {
    if (useSubsytemLinux && subsystemForLinuxPresent()) {
        const bashPath32bitApp = path.join(process.env['SystemRoot'], 'Sysnative', 'bash.exe');
        const bashPath64bitApp = path.join(process.env['SystemRoot'], 'System32', 'bash.exe');
        const bashPathHost = is64bit ? bashPath64bitApp : bashPath32bitApp;
        const subsystemLinuxPath = useExternalConsole ? bashPath64bitApp : bashPathHost;

        const bashCommand = [executable].concat(args || []).map(element => {
            if (element === program) {	// workaround for issue #35249
                element = element.replace(/\\/g, '/');
            }
            return element.indexOf(' ') > 0 ? `'${element}'` : element;
        }).join(' ');
        return <ILaunchArgs>{
            cwd,
            executable: subsystemLinuxPath,
            args: ['-ic', bashCommand],
            combined: [subsystemLinuxPath].concat(['-ic', bashCommand]),
            localRoot: cwd,
            remoteRoot: windowsPathToWSLPath(cwd)
        };
    } else {
        return <ILaunchArgs>{
            cwd: cwd,
            executable: executable,
            args: args || [],
            combined: [executable].concat(args || [])
        };
    }
}

export function spawn(useWSL: boolean, executable: string, args?: string[], options?: child_process.SpawnOptions) {
    const launchArgs = createLaunchArg(useWSL, false, undefined, executable, args);
    return child_process.spawn(launchArgs.executable, launchArgs.args, options);
}