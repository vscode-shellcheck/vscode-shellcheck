import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

// Stolen from vscode-go: https://github.com/microsoft/vscode-go/blob/d6a0fac4d1722367c9496fb516d2d05ec887fbd3/src/goPath.ts#L193
// Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
export function fixDriveCasingInWindows(pathToFix: string): string {
  return process.platform === "win32" && pathToFix
    ? pathToFix.substring(0, 1).toUpperCase() + pathToFix.substring(1)
    : pathToFix;
}

function isFileUriScheme(uri: vscode.Uri): boolean {
  return uri.scheme === "file";
}

export function guessDocumentDirname(
  textDocument: vscode.TextDocument,
): string | undefined {
  if (textDocument.isUntitled) {
    return getWorkspaceFolderPath(textDocument.uri);
  }

  if (isFileUriScheme(textDocument.uri)) {
    return path.dirname(textDocument.fileName);
  }

  return undefined;
}

export function getWorkspaceFolderPath(
  uri?: vscode.Uri,
  requireFileUri: boolean = true,
): string | undefined {
  const isSafeUriSchemeFunc = requireFileUri ? isFileUriScheme : () => true;
  if (uri) {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (workspace && isSafeUriSchemeFunc(workspace.uri)) {
      return fixDriveCasingInWindows(workspace.uri.fsPath);
    }
  }

  // fall back to the first workspace if available
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) {
    // Only file uris are supported
    const folder = folders.find((folder) => isSafeUriSchemeFunc(folder.uri));
    if (folder) {
      return fixDriveCasingInWindows(folder.uri.fsPath);
    }
  }

  return undefined;
}

// Ensure the cwd exists, or it will throw ENOENT
// https://github.com/vscode-shellcheck/vscode-shellcheck/issues/767
export async function ensureCurrentWorkingDirectory(
  cwd: string | undefined,
): Promise<string | undefined> {
  if (!cwd) {
    return undefined;
  }

  try {
    const fstat = await fs.promises.stat(cwd);
    if (!fstat.isDirectory()) {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }

  return cwd;
}

export function substitutePath(s: string, workspaceFolder?: string): string {
  if (!workspaceFolder && vscode.workspace.workspaceFolders) {
    workspaceFolder = getWorkspaceFolderPath(
      vscode.window.activeTextEditor?.document.uri,
    );
  }

  return s
    .replace(/\${workspaceRoot}/g, workspaceFolder || "")
    .replace(/\${workspaceFolder}/g, workspaceFolder || "");
}
