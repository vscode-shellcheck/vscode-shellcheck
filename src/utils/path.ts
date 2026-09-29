import * as vscode from "vscode";
import { homeDirectory, isWindows } from "../platform/index.js";

// Stolen from vscode-go: https://github.com/golang/vscode-go/blob/46048018519b6f727e920f5f5a4335acc436bdd3/extension/src/utils/pathUtils.ts#L246-L251
// Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
export function fixDriveCasingInWindows(pathToFix: string): string {
  return isWindows && pathToFix
    ? pathToFix.substring(0, 1).toUpperCase() + pathToFix.substring(1)
    : pathToFix;
}

function isFileUriScheme(uri: vscode.Uri): boolean {
  return uri.scheme === "file";
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

export function substitutePath(s: string, workspaceFolder?: string): string {
  if (!workspaceFolder && vscode.workspace.workspaceFolders) {
    workspaceFolder = getWorkspaceFolderPath(
      vscode.window.activeTextEditor?.document.uri,
    );
  }

  if (homeDirectory !== undefined) {
    s = s.replace(/\${userHome}/g, fixDriveCasingInWindows(homeDirectory));
  }

  return s
    .replace(/\${workspaceRoot}/g, workspaceFolder || "")
    .replace(/\${workspaceFolder}/g, workspaceFolder || "");
}
