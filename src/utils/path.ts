import path = require("path");
import * as vscode from "vscode";

// Stolen from vscode-go: https://github.com/microsoft/vscode-go/blob/d6a0fac4d1722367c9496fb516d2d05ec887fbd3/src/goPath.ts#L193
// Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
export function fixDriveCasingInWindows(pathToFix: string): string {
  return process.platform === "win32" && pathToFix
    ? pathToFix.substr(0, 1).toUpperCase() + pathToFix.substr(1)
    : pathToFix;
}

function isSupportedUriScheme(uri: vscode.Uri): boolean {
  return uri.scheme === "file";
}

export function guessDocumentDirname(textDocument: vscode.TextDocument): string | undefined {
  if (textDocument.isUntitled) {
    return getWorkspaceFolderPath(textDocument.uri);
  }

  if (isSupportedUriScheme(textDocument.uri)) {
    return path.dirname(textDocument.fileName);
  }

  return undefined;
}

export function getWorkspaceFolderPath(fileUri?: vscode.Uri): string | undefined {
  if (fileUri) {
    const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
    if (workspace && isSupportedUriScheme(workspace.uri)) {
      return fixDriveCasingInWindows(workspace.uri.fsPath);
    }
  }

  // fall back to the first workspace if available
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) {
    // Only file uris are supported
    let folder = folders.find((folder) => isSupportedUriScheme(folder.uri));
    if (folder) {
      return fixDriveCasingInWindows(folder.uri.fsPath);
    }
  }

  return undefined;
}
