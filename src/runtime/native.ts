import fs from "node:fs/promises";
import { dirname } from "node:path";
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
};
