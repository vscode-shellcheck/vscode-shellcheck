import * as vscode from "vscode";

function executeCodeActionProvider(uri: vscode.Uri, range: vscode.Range) {
  return vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    uri,
    range,
  );
}

async function getFixAllCodeAction(
  document: vscode.TextDocument,
): Promise<vscode.CodeAction | undefined> {
  const actionRanges = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) => diagnostic.source === "shellcheck")
    .map((diagnostic) => diagnostic.range);

  const codeActions: vscode.CodeAction[] = [];
  for (const range of actionRanges) {
    const codeActionsForDiagnostic = await executeCodeActionProvider(
      document.uri,
      range,
    );

    if (codeActionsForDiagnostic) {
      // get only code actions from shellcheck which perform edits and isPreferred
      const actionToFix = codeActionsForDiagnostic.filter(
        (action) =>
          action.title.startsWith("ShellCheck: ") &&
          action.isPreferred &&
          action.edit,
      );
      codeActions.push(...actionToFix);
    }
  }

  if (codeActions.length > 0) {
    const fixAll = new vscode.CodeAction(
      "ShellCheck: Fix all auto-fixable issues",
      FixAllProvider.fixAllCodeActionKind,
    );

    for (const action of codeActions) {
      if (action.diagnostics) {
        if (!fixAll.diagnostics) {
          fixAll.diagnostics = [];
        }
        fixAll.diagnostics.push(...action.diagnostics);
      }
      if (action.edit) {
        if (!fixAll.edit) {
          fixAll.edit = new vscode.WorkspaceEdit();
        }
        for (const actionEditEntries of action.edit.entries()) {
          // filter overlapping edits to prevent wrong behavior
          let duplicated = false;
          for (const actionEdit of actionEditEntries[1]) {
            for (const fixAllEditEntries of fixAll.edit.entries()) {
              for (const fixAllEdit of fixAllEditEntries[1]) {
                if (fixAllEdit.range.contains(actionEdit.range)) {
                  duplicated = true;
                  break;
                }
              }
              if (duplicated) {
                break;
              }
            }
            if (duplicated) {
              break;
            }
          }
          if (!duplicated) {
            fixAll.edit.set(actionEditEntries[0], actionEditEntries[1]);
          }
        }
      }
    }
    return fixAll;
  }

  return undefined;
}

export class FixAllProvider implements vscode.CodeActionProvider {
  public static readonly fixAllCodeActionKind =
    vscode.CodeActionKind.SourceFixAll.append("shellcheck");

  public static metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [FixAllProvider.fixAllCodeActionKind],
  };

  public async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[]> {
    if (!context.only) {
      return [];
    }

    if (
      !context.only.contains(FixAllProvider.fixAllCodeActionKind) &&
      !FixAllProvider.fixAllCodeActionKind.contains(context.only)
    ) {
      return [];
    }

    const fixAllAction = await getFixAllCodeAction(document);
    if (!fixAllAction) {
      return [];
    }

    return [fixAllAction];
  }
}
