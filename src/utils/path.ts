import * as vscode from "vscode";
import * as platform from "../platform/index.js";

// Stolen from vscode-go: https://github.com/golang/vscode-go/blob/46048018519b6f727e920f5f5a4335acc436bdd3/extension/src/utils/pathUtils.ts#L246-L251
// Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
export function fixDriveCasingInWindows(pathToFix: string): string {
  return platform.fixDriveCasingInWindows(pathToFix);
}

function isFileUriScheme(uri: vscode.Uri): boolean {
  return uri.scheme === "file";
}

export function guessDocumentDirname(
  textDocument: vscode.TextDocument,
): string | undefined {
  return platform.guessDocumentDirname(textDocument);
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
  return await platform.ensureCurrentWorkingDirectory(cwd);
}

export function substitutePath(s: string, workspaceFolder?: string): string {
  if (!workspaceFolder && vscode.workspace.workspaceFolders) {
    workspaceFolder = getWorkspaceFolderPath(
      vscode.window.activeTextEditor?.document.uri,
    );
  }

  const userHome = platform.homeDirectory();

  return s
    .replace(/\${userHome}/g, userHome ?? "${" + "userHome}")
    .replace(/\${workspaceRoot}/g, workspaceFolder || "")
    .replace(/\${workspaceFolder}/g, workspaceFolder || "");
}
