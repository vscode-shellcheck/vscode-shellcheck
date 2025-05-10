import * as vscode from "vscode";

export interface ShellCheckExtensionApiVersion1 {
  registerDocumentFilter: (
    documentFilter: vscode.DocumentFilter,
  ) => vscode.Disposable;
}

export interface ShellCheckExtensionApi {
  apiVersion1: ShellCheckExtensionApiVersion1;
}
