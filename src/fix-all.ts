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
  const actionRanges = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) => diagnostic.source === "shellcheck")
    .map((diagnostic) => diagnostic.range);

  const codeActions: vscode.CodeAction[] = [];
  for (const range of actionRanges) {
    const codeActionsForDiagnostic = await executeCodeActionProvider(
      document.uri,
      range
    );

    if (codeActionsForDiagnostic) {
      // get only code actions which perform edits
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
        for (const [uri, textEdits] of action.edit.entries()) {
          // filter overlapping edits to prevent wrong behavior
          const overlapped = hasOverlappedTextEdits(fixAll, textEdits);
          if (!overlapped) {
            fixAll.edit.set(uri, textEdits);
          }
        }
      }
    }
    return fixAll;
  }

  return undefined;
}

function getActionRanges(action: vscode.CodeAction): vscode.Range[] {
  if (!action.edit) {
    return [];
  }

  const ranges: vscode.Range[] = [];
  for (const [_, textEdits] of action.edit.entries()) {
    for (const textEdit of textEdits) {
      ranges.push(textEdit.range);
    }
  }
  return ranges;
}

function hasOverlappedTextEdits(
  action: vscode.CodeAction,
  actionTextEdits: vscode.TextEdit[]
): boolean {
  const ranges = getActionRanges(action);
  if (ranges.length === 0) {
    return false;
  }

  for (const actionEdit of actionTextEdits) {
    for (const range of ranges) {
      if (range.contains(actionEdit.range)) {
        return true;
      }
    }
  }

  return false;
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
