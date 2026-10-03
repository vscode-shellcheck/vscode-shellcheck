import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  resetRuntime,
  updateShellCheckSetting,
  waitForDiagnostics,
} from "./helpers.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const binary = path.join(
  repoRoot,
  "binaries",
  process.platform,
  process.arch,
  "shellcheck",
);

/**
 * Stands in for shellcheck and logs every run: `probe` for the version probe,
 * which it holds open long enough for concurrent cache misses to overlap it,
 * and `lint <marker>` for a lint, naming the `marker-*` in the script.
 */
function wrapperScript(log: string): string {
  return `#!/bin/sh
if [ "$1" = "-V" ]; then
  echo probe >> '${log}'
  sleep 1
  exec '${binary}' "$@"
fi
input=$(cat)
echo "lint $(printf '%s' "$input" | grep -o 'marker-[a-z0-9-]*' | head -n 1)" >> '${log}'
printf '%s\\n' "$input" | '${binary}' "$@"
`;
}

suite("Native spawns", () => {
  let log: string;

  suiteSetup(async function () {
    if (process.platform === "win32") {
      // The wrapper is a shell script, which Windows cannot spawn directly.
      this.skip();
    }
    // Activation lints the documents already open one after the other, so
    // only the events of an active extension can miss the cache together.
    await vscode.extensions.getExtension("timonwong.shellcheck")!.activate();
    await resetRuntime();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shellcheck-spawns-"));
    log = path.join(dir, "log");
    const wrapper = path.join(dir, "shellcheck");
    await fs.writeFile(wrapper, wrapperScript(log), { mode: 0o755 });
    await updateShellCheckSetting("executablePath", wrapper);
  });

  suiteTeardown(async () => {
    await updateShellCheckSetting("executablePath", undefined);
  });

  teardown(async () => {
    await closeAllEditors();
  });

  async function runs(entry: string): Promise<number> {
    const lines = (await fs.readFile(log, "utf8")).split("\n");
    return lines.filter((line) => line === entry).length;
  }

  test("probes the executable once for documents opened together", async () => {
    const documents = await Promise.all(
      [1, 2, 3].map((i) =>
        vscode.workspace.openTextDocument({
          language: "shellscript",
          content: `#!/bin/bash\n# marker-probe-${i}\nx=1\n`,
        }),
      ),
    );
    await Promise.all(
      documents.map((document) => waitForDiagnostics(document)),
    );

    assert.strictEqual(await runs("probe"), 1);
  });

  test("drops the pending lint of a document closed during its debounce", async () => {
    const document = await openDocument(
      "#!/bin/bash\n# marker-closed\nx=1\n",
      "shellscript",
    );
    await waitForDiagnostics(document);

    await vscode.window.activeTextEditor!.edit((edit) =>
      edit.insert(new vscode.Position(3, 0), "y=1\n"),
    );
    // Closes the document well within the debounce of the edit's lint.
    await vscode.languages.setTextDocumentLanguage(document, "plaintext");

    // Debounced the same and triggered later, so by the time it has
    // diagnostics the closed document's lint would have run as well.
    const sentinel = await openDocument(
      "#!/bin/bash\n# marker-sentinel\nx=1\n",
      "shellscript",
    );
    await waitForDiagnostics(sentinel);

    assert.strictEqual(await runs("lint marker-closed"), 1);
  });
});
