import * as vscode from "vscode";
import {
  escapeMarkdownText,
  prettyDiagnosticMessage,
} from "./pretty-diagnostic.js";

const settingName = "markdownDiagnostics";

function escapeHtmlAttribute(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return '<span style="color:var(--vscode-editorError-foreground);"><span class="codicon codicon-error"></span> <strong>Error</strong></span>';
    case vscode.DiagnosticSeverity.Warning:
      return '<span style="color:var(--vscode-editorWarning-foreground);"><span class="codicon codicon-warning"></span> <strong>Warning</strong></span>';
    case vscode.DiagnosticSeverity.Information:
      return '<span style="color:var(--vscode-editorInfo-foreground);"><span class="codicon codicon-info"></span> <strong>Information</strong></span>';
    case vscode.DiagnosticSeverity.Hint:
      return '<span style="color:var(--vscode-editorHint-foreground);"><span class="codicon codicon-light-bulb"></span> <strong>Hint</strong></span>';
    default:
      return "<strong>Diagnostic</strong>";
  }
}

function diagnosticCode(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }
  if (code && typeof code.value !== "undefined") {
    return String(code.value);
  }
  return undefined;
}

function diagnosticTarget(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (code && typeof code === "object" && code.target) {
    return code.target.toString();
  }
  return undefined;
}

export function formatDiagnosticForHover(
  diagnostic: vscode.Diagnostic,
): string {
  const code = diagnosticCode(diagnostic);
  const target = diagnosticTarget(diagnostic);
  const title = [
    severityLabel(diagnostic.severity),
    code
      ? `<span style="color:var(--vscode-descriptionForeground);">(${escapeMarkdownText(code)})</span>`
      : undefined,
    target
      ? `<a href="${escapeHtmlAttribute(target)}" title="Open ShellCheck rule documentation"><span class="codicon codicon-link-external"></span></a>`
      : undefined,
    // This formatted-hover implementation follows the approach used by
    // pretty-ts-errors, including its Codicon marker and optional CSS ordering
    // workaround:
    // https://github.com/yoavbls/pretty-ts-errors
    '<span class="codicon codicon-none"></span>',
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");

  return `${title}\n\n${prettyDiagnosticMessage(diagnostic.message)}`;
}

export type MarkdownDiagnosticsEnabled = (
  document: vscode.TextDocument,
) => boolean;

export class MarkdownDiagnosticProvider implements vscode.HoverProvider {
  constructor(
    // Only the extension's own collection: vscode.languages.getDiagnostics()
    // also returns diagnostics from other extensions, which Bash IDE reports
    // under the same "shellcheck" source.
    private readonly getDiagnostics: (
      uri: vscode.Uri,
    ) => readonly vscode.Diagnostic[],
    private readonly isEnabled: MarkdownDiagnosticsEnabled = (document) =>
      // Keep this setting out of ShellCheckSettings: changing it must not rerun
      // the linter for every open document.
      vscode.workspace
        .getConfiguration("shellcheck", document.uri)
        .get<boolean>(settingName, false),
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!this.isEnabled(document)) {
      return undefined;
    }

    const diagnostics = this.getDiagnostics(document.uri).filter((diagnostic) =>
      diagnostic.range.contains(position),
    );

    if (diagnostics.length === 0) {
      return undefined;
    }

    const contents = diagnostics.map((diagnostic) => {
      // Theme icons stay off: VS Code rewrites $(name) on the rendered HTML,
      // which would turn literal $(...) in a message into a codicon.
      const markdown = new vscode.MarkdownString(
        formatDiagnosticForHover(diagnostic),
      );
      markdown.supportHtml = true;
      return markdown;
    });

    return new vscode.Hover(contents, diagnostics[0].range);
  }
}
