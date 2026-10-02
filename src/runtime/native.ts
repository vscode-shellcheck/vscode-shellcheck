import fs from "node:fs/promises";
import os from "node:os";
import path, { dirname } from "node:path";
import * as vscode from "vscode";
import { getWorkspaceFolderPath, substitutePath } from "../utils/path.js";
import {
  getToolVersion,
  tryPromptForUpdatingTool,
} from "../utils/tool-check.js";
import { NativeRunner } from "./native-runner.js";
import { Executable, NativeRuntime } from "./types.js";

async function resolveExecutable(
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
      await fs.access(executablePath, fs.constants.X_OK);
      return { path: executablePath, bundled: true };
    } catch (error) {
      return {
        path: "shellcheck", // Fallback to default shellcheck path.
        bundled: false,
      };
    }
  }

  return { path: substitutePath(executablePath), bundled: false };
}

function guessDocumentDirname(
  textDocument: vscode.TextDocument,
): string | undefined {
  if (textDocument.isUntitled) {
    return getWorkspaceFolderPath(textDocument.uri);
  }

  if (textDocument.uri.scheme === "file") {
    return dirname(textDocument.fileName);
  }

  return undefined;
}

// Ensure the cwd exists, or it will throw ENOENT
// https://github.com/vscode-shellcheck/vscode-shellcheck/issues/767
async function ensureCurrentWorkingDirectory(
  cwd: string | undefined,
): Promise<string | undefined> {
  if (!cwd) {
    return undefined;
  }

  try {
    const fstat = await fs.stat(cwd);
    if (!fstat.isDirectory()) {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }

  return cwd;
}

// Mirrors shellcheck's getAppUserDataDirectory and getXdgDirectory XdgConfig,
// which both resolve to %APPDATA% on Windows.
function userConfigFiles(): string[] {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    return appData ? [path.join(appData, "shellcheckrc")] : [];
  }
  const home = os.homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  return [
    path.join(home, ".shellcheckrc"),
    path.join(
      xdgConfigHome && path.isAbsolute(xdgConfigHome)
        ? xdgConfigHome
        : path.join(home, ".config"),
      "shellcheckrc",
    ),
  ];
}

function parentDirectories(folder: string): string[] {
  const parents: string[] = [];
  for (let dir = dirname(folder); dir !== folder; dir = dirname(dir)) {
    parents.push(dir);
    folder = dir;
  }
  return parents;
}

export const nativeRuntime: NativeRuntime | undefined = {
  resolveExecutable,
  getToolVersion,
  tryPromptForUpdatingTool,
  workingDirectory: (textDocument, useWorkspaceRootAsCwd) =>
    ensureCurrentWorkingDirectory(
      useWorkspaceRootAsCwd
        ? getWorkspaceFolderPath(textDocument.uri)
        : guessDocumentDirname(textDocument),
    ),
  createRunner: () => new NativeRunner(),
  userConfigFiles,
  parentDirectories,
  resolvePath: (base, p) => path.resolve(base, p),
};
