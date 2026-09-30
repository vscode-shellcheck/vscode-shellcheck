import * as vscode from "vscode";

/**
 * The dialect a `.bash`, `.ksh` or `.dash` file name asks for. Read off
 * `Uri.path`, which is POSIX for every scheme.
 */
export function shellDialectForUri(uri: vscode.Uri): string | undefined {
  return /[^/]\.(bash|ksh|dash)$/.exec(uri.path)?.[1];
}
