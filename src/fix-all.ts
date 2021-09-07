import * as vscode from "vscode";

function executeCodeActionProvider(uri: vscode.Uri, range: vscode.Range) {
  return vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    uri,
    range
  );
}

async function getFixAllCodeAction(
  document: vscode.TextDocument
): Promise<vscode.CodeAction | undefined> {
  const nonUniqueRanges = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) => diagnostic.source === "shellcheck")
    .map((diagnostic) => diagnostic.range);

  // filter ranges so we get only unique ranges
  const uniqueRanges: vscode.Range[] = [];
  for (const nonUniqueRange of nonUniqueRanges) {
    let duplicated = false;

    for (const uniqueRange of uniqueRanges) {
      if (uniqueRange.contains(nonUniqueRange)) {
        duplicated = true;
        break;
      }
    }

    if (!duplicated) {
      uniqueRanges.push(nonUniqueRange);
    }
  }

  const codeActions: vscode.CodeAction[] = [];
  for (const range of uniqueRanges) {
    const codeActionsForDiagnostic = await executeCodeActionProvider(
      document.uri,
      range
    );

    if (codeActionsForDiagnostic) {
      // get only codeactions which perform edits
      const actionToFix = codeActionsForDiagnostic.filter(
        (action) => action.edit
      );
      codeActions.push(...actionToFix);
    }
  }

  if (codeActions.length > 0) {
    const fixAll = new vscode.CodeAction(
      "Fix All ShellCheck",
      FixAllProvider.fixAllCodeActionKind
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
        for (const edit of action.edit.entries()) {
          fixAll.edit.set(edit[0], edit[1]);
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
    _token: vscode.CancellationToken
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
