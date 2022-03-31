import * as vscode from "vscode";
import { getWikiUrlForRule } from "./utils/link";

export class LinkifyProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    // Possible shellcheck directives:
    //   - # shellcheck disable=code,code,...
    //   - # shellcheck disable=SC0000-SC9999
    // This method first find matching directives, then extracting rule ids and do linkify.

    const text = document.getText();
    const directivePattern = /^\s*#\s*shellcheck\s+disable=.+$/gm;
    const result: vscode.DocumentLink[] = [];

    let match;
    while ((match = directivePattern.exec(text)) !== null) {
      const startPosition = document.positionAt(match.index);
      this.getMatchesOnLine(startPosition, match[0], result);
    }

    return result;
  }

  private getMatchesOnLine(
    startPosition: vscode.Position,
    line: string,
    result: vscode.DocumentLink[]
  ) {
    const pattern = /\bSC\d+\b/g;

    let match;
    while ((match = pattern.exec(line)) !== null) {
      const ruleId = match[0];
      const url = getWikiUrlForRule(ruleId);
      const position = startPosition.translate(0, match.index);
      const range = new vscode.Range(
        position,
        position.translate(0, ruleId.length)
      );

      const link = new vscode.DocumentLink(range, vscode.Uri.parse(url));
      result.push(link);
    }
  }
}
