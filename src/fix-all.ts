import * as vscode from "vscode";
import type { ParseResult } from "./parser.js";

function getFixAllCodeAction(
  results: readonly ParseResult[],
): vscode.CodeAction | undefined {
  const codeActions = results.flatMap(({ codeAction }) =>
    codeAction ? [codeAction] : [],
  );

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
        for (const [uri, edits] of action.edit.entries()) {
          const existingEdits = fixAll.edit.get(uri);
          // if any edit overlaps with existing edits, skip all edits for this
          // URI to prevent wrong behavior from applying conflicting fixes
          const hasOverlap = edits.some((edit) =>
            existingEdits.some((existingEdit) =>
              existingEdit.range.contains(edit.range),
            ),
          );
          if (!hasOverlap) {
            fixAll.edit.set(uri, edits);
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

  public constructor(
    /** The linter's own results for a document, which carry its fixes. */
    private readonly resultsFor: (
      document: vscode.TextDocument,
    ) => readonly ParseResult[] | undefined,
  ) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (!context.only) {
      return [];
    }

    if (
      !context.only.contains(FixAllProvider.fixAllCodeActionKind) &&
      !FixAllProvider.fixAllCodeActionKind.contains(context.only)
    ) {
      return [];
    }

    const fixAllAction = getFixAllCodeAction(this.resultsFor(document) ?? []);
    if (!fixAllAction) {
      return [];
    }

    return [fixAllAction];
  }
}
