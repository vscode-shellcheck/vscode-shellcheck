import assert from "node:assert";
import * as vscode from "vscode";
import { MarkdownDiagnosticProvider } from "../src/markdown-diagnostics.js";
import { ShellCheckSettings } from "../src/settings.js";
import { closeAllEditors, openDocument } from "./helpers.js";

function shellCheckDiagnostic(message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 4),
    message,
    vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = "shellcheck";
  diagnostic.code = {
    value: "SC2006",
    target: vscode.Uri.parse("https://www.shellcheck.net/wiki/SC2006"),
  };
  return diagnostic;
}

function hoverValue(hover: vscode.Hover | undefined): vscode.MarkdownString {
  assert.ok(hover);
  assert.strictEqual(hover.contents.length, 1);
  assert.ok(hover.contents[0] instanceof vscode.MarkdownString);
  return hover.contents[0];
}

suite("Markdown diagnostic hovers", () => {
  teardown(async () => {
    await closeAllEditors();
  });

  test("does not inspect diagnostics when the feature is disabled", async () => {
    const document = await openDocument("echo hello", "shellscript");
    const provider = new MarkdownDiagnosticProvider(
      () => assert.fail("diagnostics must not be read when disabled"),
      () => false,
    );

    assert.strictEqual(
      provider.provideHover(document, new vscode.Position(0, 1)),
      undefined,
    );
  });

  test("renders formatted ShellCheck messages as Markdown", async () => {
    const document = await openDocument("echo hello", "shellscript");
    const diagnostic = shellCheckDiagnostic(
      "Use \x60$(...)\x60 notation instead of legacy backticks \x60...\x60.",
    );
    const provider = new MarkdownDiagnosticProvider(
      () => [diagnostic],
      () => true,
    );

    const markdown = hoverValue(
      provider.provideHover(document, new vscode.Position(0, 1)),
    );

    assert.strictEqual(
      markdown.value,
      '<span style="color:var(--vscode-editorWarning-foreground);"><span class="codicon codicon-warning"></span> <strong>Warning</strong></span> <span style="color:var(--vscode-descriptionForeground);">(SC2006)</span> <a href="https://www.shellcheck.net/wiki/SC2006" title="Open ShellCheck rule documentation"><span class="codicon codicon-link-external"></span></a> <span class="codicon codicon-none"></span>\n\nUse \x60$(...)\x60 notation instead of legacy backticks \x60...\x60\\.',
    );
    assert.strictEqual(markdown.supportThemeIcons, true);
    assert.strictEqual(markdown.supportHtml, true);
  });

  test("does not take part in the settings that trigger a re-lint", () => {
    // checkIfConfigurationChanged() reruns the linter for every key it knows,
    // so toggling the hover format must not be one of them.
    assert.ok(!("markdownDiagnostics" in ShellCheckSettings.keys));
  });
});
