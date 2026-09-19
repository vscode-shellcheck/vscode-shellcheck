import assert from "node:assert";
import * as vscode from "vscode";
import { MarkdownDiagnosticProvider } from "../src/markdown-diagnostics.js";
import { closeAllEditors, openDocument } from "./helpers.js";

suite("Markdown diagnostic hovers", () => {
  teardown(async () => {
    await closeAllEditors();
  });

  test("does not inspect diagnostics when the feature is disabled", async () => {
    const document = await openDocument("echo hello", "shellscript");
    const collection = vscode.languages.createDiagnosticCollection(
      "markdown-diagnostics-disabled",
    );
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 4),
      "Use \x60$(...)\x60 notation instead of legacy backticks \x60...\x60.",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = "shellcheck";
    diagnostic.code = {
      value: "SC2006",
      target: vscode.Uri.parse("https://www.shellcheck.net/wiki/SC2006"),
    };
    collection.set(document.uri, [diagnostic]);

    try {
      const provider = new MarkdownDiagnosticProvider();
      assert.strictEqual(
        provider.provideHover(document, new vscode.Position(0, 1)),
        undefined,
      );
    } finally {
      collection.dispose();
    }
  });

  test("renders formatted ShellCheck messages as Markdown", async () => {
    const document = await openDocument("echo hello", "shellscript");
    const collection = vscode.languages.createDiagnosticCollection(
      "markdown-diagnostics-enabled",
    );
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 4),
      "Use \x60$(...)\x60 notation instead of legacy backticks \x60...\x60.",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = "shellcheck";
    diagnostic.code = {
      value: "SC2006",
      target: vscode.Uri.parse("https://www.shellcheck.net/wiki/SC2006"),
    };
    collection.set(document.uri, [diagnostic]);

    try {
      const provider = new MarkdownDiagnosticProvider(() => true);
      const hover = provider.provideHover(document, new vscode.Position(0, 1));

      assert.ok(hover);
      assert.strictEqual(hover.contents.length, 1);
      assert.ok(hover.contents[0] instanceof vscode.MarkdownString);
      assert.strictEqual(
        (hover.contents[0] as vscode.MarkdownString).value,
        '<span style="color:var(--vscode-editorWarning-foreground);"><span class="codicon codicon-warning"></span> <strong>Warning</strong></span> <span style="color:var(--vscode-descriptionForeground);">(SC2006)</span> <a href="https://www.shellcheck.net/wiki/SC2006" title="Open ShellCheck rule documentation"><span class="codicon codicon-link-external"></span></a> <span class="codicon codicon-none"></span>\n\nUse \x60$(...)\x60 notation instead of legacy backticks \x60...\x60\\.',
      );
      assert.strictEqual(
        (hover.contents[0] as vscode.MarkdownString).supportThemeIcons,
        true,
      );
      assert.strictEqual(
        (hover.contents[0] as vscode.MarkdownString).supportHtml,
        true,
      );
    } finally {
      collection.dispose();
    }
  });
});
