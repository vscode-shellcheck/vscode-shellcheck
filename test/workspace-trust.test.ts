import assert from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import * as vscode from "vscode";
import { openWorkspaceDocument, waitForDiagnostics } from "./helpers.js";

const ARTIFACT_DIR = new URL("../workspace-trust-e2e/", import.meta.url);

suite("Workspace Trust", () => {
  test("opens the workspace in Restricted Mode", () => {
    // vscode-test launches with trust disabled, which trusts every workspace;
    // without this the suite below would pass without restricting anything.
    assert.strictEqual(vscode.workspace.isTrusted, false);
  });

  test("ignores the workspace's shellcheck.executablePath", async () => {
    // The fixture points it at a program that does not exist, so a lint can
    // only come from the bundled ShellCheck.
    const document = await openWorkspaceDocument("script.sh");
    const diagnostics = await waitForDiagnostics(
      document,
      15000,
      (items) =>
        items.some(
          (diagnostic) =>
            typeof diagnostic.code === "object" &&
            diagnostic.code.value === "SC2034",
        ),
      { acceptCurrent: true },
    );

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(
      new URL("diagnostics.json", ARTIFACT_DIR),
      `${JSON.stringify(
        {
          isTrusted: vscode.workspace.isTrusted,
          executablePath: vscode.workspace
            .getConfiguration("shellcheck")
            .inspect("executablePath"),
          diagnostics: diagnostics.map((diagnostic) => ({
            code: (diagnostic.code as { value: string }).value,
            message: diagnostic.message,
            line: diagnostic.range.start.line,
          })),
        },
        null,
        2,
      )}\n`,
    );
  });
});
