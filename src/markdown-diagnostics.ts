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

const severityStyles: Record<
  vscode.DiagnosticSeverity,
  { color: string; icon: string; label: () => string }
> = {
  [vscode.DiagnosticSeverity.Error]: {
    color: "editorError",
    icon: "error",
    label: () => vscode.l10n.t("Error"),
  },
  [vscode.DiagnosticSeverity.Warning]: {
    color: "editorWarning",
    icon: "warning",
    label: () => vscode.l10n.t("Warning"),
  },
  [vscode.DiagnosticSeverity.Information]: {
    color: "editorInfo",
    icon: "info",
    label: () => vscode.l10n.t("Information"),
  },
  [vscode.DiagnosticSeverity.Hint]: {
    color: "editorHint",
    icon: "light-bulb",
    label: () => vscode.l10n.t("Hint"),
  },
};

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  const style = severityStyles[severity];
  if (!style) {
    return `<strong>${vscode.l10n.t("Diagnostic")}</strong>`;
  }
  return `<span style="color:var(--vscode-${style.color}-foreground);"><span class="codicon codicon-${style.icon}"></span> <strong>${style.label()}</strong></span>`;
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
      ? `<a href="${escapeHtmlAttribute(target)}" title="${escapeHtmlAttribute(vscode.l10n.t("Open ShellCheck rule documentation"))}"><span class="codicon codicon-link-external"></span></a>`
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
