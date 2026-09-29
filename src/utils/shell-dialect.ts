import * as vscode from "vscode";

export function shellDialectForUri(uri: vscode.Uri): string | undefined {
  const segment = uri.path.slice(uri.path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  const extension = dot > 0 ? segment.slice(dot).toLowerCase() : "";
  return extension === ".bash" || extension === ".ksh" || extension === ".dash"
    ? extension.slice(1)
    : undefined;
}
