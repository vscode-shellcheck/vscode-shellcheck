import assert from "node:assert";
import { SemVer } from "semver";
import * as vscode from "vscode";
import { describeShellCheckError } from "../src/failure-ux.js";
import { formatDiagnosticForHover } from "../src/markdown-diagnostics.js";
import { RunTrigger } from "../src/settings.js";
import { menuItems, StatusSnapshot, statusBarView } from "../src/status-bar.js";

interface Command {
  command: string;
  /** VS Code keeps the English title of a translated command as `original`. */
  title: { value: string; original: string };
}

const snapshot: StatusSnapshot = {
  runtime: "native",
  canSwitchRuntime: true,
  enabled: true,
  trigger: RunTrigger.onType,
  bundled: true,
  tool: { ok: true, version: new SemVer("0.11.0") },
};

suite("Simplified Chinese", () => {
  suiteSetup(async () => {
    // The extension's translations are loaded when it activates.
    await vscode.extensions.getExtension("timonwong.shellcheck")!.activate();
  });

  test("VS Code runs in Simplified Chinese", () => {
    assert.strictEqual(vscode.env.language, "zh-cn");
  });

  test("contributions are translated", () => {
    const commands = vscode.extensions.getExtension("timonwong.shellcheck")!
      .packageJSON.contributes.commands as Command[];
    assert.deepStrictEqual(
      commands.find((command) => command.command === "shellcheck.runLint")
        ?.title,
      { value: "检查当前文档", original: "Lint Current Document" },
    );
  });

  test("the status bar is translated", () => {
    assert.strictEqual(
      statusBarView(snapshot).tooltip,
      "**ShellCheck 0.11.0**\n\n运行时：native（内置）\n\n检查：键入时",
    );
    assert.strictEqual(menuItems(snapshot)[0].label, "$(gear) 打开设置");
  });

  test("failure notifications are translated around the English error", () => {
    const error: NodeJS.ErrnoException = new Error("denied");
    error.code = "EACCES";
    assert.strictEqual(
      describeShellCheckError(error, "native").message,
      "运行 shellcheck 失败：[EACCES] denied",
    );

    error.code = "ENOENT";
    assert.deepStrictEqual(
      describeShellCheckError(error, "native").items.map((item) => item.title),
      ["确定", "安装指南", "试用实验性的 WASM 运行时"],
    );
  });

  test("the diagnostic hover is translated", () => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 4),
      "message",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = {
      value: "SC2006",
      target: vscode.Uri.parse("https://www.shellcheck.net/wiki/SC2006"),
    };
    const hover = formatDiagnosticForHover(diagnostic);
    assert.ok(hover.includes("<strong>警告</strong>"), hover);
    assert.ok(hover.includes('title="打开 ShellCheck 规则文档"'), hover);
  });
});
