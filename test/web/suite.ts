import * as vscode from "vscode";
import {
  closeAllEditors,
  lintActiveDocument,
  openDocument,
  openWorkspaceDocument,
  updateShellCheckSetting,
  waitForDiagnostics,
} from "../helpers.js";
import {
  NormalizedDiagnostic,
  normalize,
  PARITY_FIXTURES,
} from "../parity-fixtures.js";

/** Read off the output by `run.mjs`, which saves it as the run's artifact. */
const ARTIFACT_MARKER = "WEB_E2E_DIAGNOSTICS ";

function assertEqual(actual: unknown, expected: unknown, what: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

suite("VS Code for the Web", () => {
  const linted: Record<string, NormalizedDiagnostic[]> = {};

  suiteSetup(async () => {
    // Asking for native proves the setting is ignored where there is none.
    // Not awaited through updateShellCheckSetting: writing the default raises
    // no configuration change to wait for.
    await vscode.workspace
      .getConfiguration("shellcheck")
      .update("runtime", "native", vscode.ConfigurationTarget.Global);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
    console.log(ARTIFACT_MARKER + JSON.stringify(linted));
  });

  // The desktop parity fixtures, so the web has to report exactly what native
  // ShellCheck does, `.shellcheckrc` lookup and `source` included.
  for (const fixture of PARITY_FIXTURES) {
    test(`reports the native findings for ${fixture.title}`, async () => {
      await updateShellCheckSetting("customArgs", fixture.customArgs);
      const document = await openWorkspaceDocument(fixture.path);
      const diagnostics = normalize(await lintActiveDocument(document));
      linted[fixture.path] = diagnostics;
      assertEqual(
        diagnostics.map(({ code, range }) => ({ code, line: range[0] })),
        fixture.expected,
        fixture.path,
      );
    });
  }

  test("lints an untitled document as it is typed", async () => {
    await updateShellCheckSetting("customArgs", undefined);
    const document = await openDocument(
      "#!/bin/bash\necho $1\n",
      "shellscript",
    );
    const diagnostics = normalize(await waitForDiagnostics(document, 15000));
    linted.untitled = diagnostics;
    assertEqual(
      diagnostics.map(({ code }) => code),
      ["SC2086"],
      document.uri.toString(),
    );
  });
});
