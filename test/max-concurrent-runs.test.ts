import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import {
  closeAllEditors,
  openDocument,
  updateShellCheckSetting,
  waitForDiagnostics,
} from "./helpers.js";

const DOCUMENTS = 4;

const has = (diagnostics: readonly vscode.Diagnostic[], code: string) =>
  diagnostics.some(
    (diagnostic) =>
      typeof diagnostic.code === "object" && diagnostic.code.value === code,
  );

function realShellCheck(): string {
  const bundled = path.join(
    vscode.extensions.getExtension("timonwong.shellcheck")!.extensionPath,
    "binaries",
    process.platform,
    process.arch,
    "shellcheck",
  );
  return fs.existsSync(bundled) ? bundled : "shellcheck";
}

/**
 * Writes a stand-in for shellcheck that appends, for every lint it runs, how
 * many lints were running when it started. Each lint is held open a little so
 * runs admitted together are certain to overlap.
 */
function writeRecordingShellCheck(dir: string): string {
  const script = path.join(dir, "shellcheck");
  fs.writeFileSync(
    script,
    `#!/bin/sh
for last in "$@"; do :; done
if [ "$last" != "-" ]; then
  exec '${realShellCheck()}' "$@"
fi
touch '${dir}/run.'$$
ls '${dir}' | grep -c '^run\\.' >> '${dir}/observed'
sleep 0.3
'${realShellCheck()}' "$@"
status=$?
rm -f '${dir}/run.'$$
exit $status
`,
    { mode: 0o755 },
  );
  return script;
}

suite("Concurrent native runs", function () {
  // With a limit of 1, the stand-in's sleep adds up over every run.
  this.timeout(30000);

  let dir: string;
  let documents: vscode.TextDocument[];

  /** How many lints were running as each one started, in start order. */
  function observed(): number[] {
    const file = path.join(dir, "observed");
    if (!fs.existsSync(file)) {
      return [];
    }
    return fs
      .readFileSync(file, "utf-8")
      .trim()
      .split("\n")
      .map((line) => Number(line));
  }

  /**
   * Lints every open document at once, as any settings change does, and waits
   * for all of them. SC2154 is never excluded: a settings change clears the
   * diagnostics before linting, which must not pass for a finished lint.
   */
  async function lintAllWithExclude(exclude: string[]): Promise<void> {
    const linted = documents.map((document) =>
      waitForDiagnostics(
        document,
        15000,
        (diagnostics) =>
          has(diagnostics, "SC2154") &&
          has(diagnostics, "SC2034") === !exclude.includes("2034"),
      ),
    );
    await updateShellCheckSetting("exclude", exclude);
    await Promise.all(linted);
  }

  suiteSetup(async function () {
    if (process.platform === "win32") {
      this.skip();
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "shellcheck-concurrency-"));
    await updateShellCheckSetting(
      "executablePath",
      writeRecordingShellCheck(dir),
    );
    documents = [];
    for (let i = 0; i < DOCUMENTS; i++) {
      documents.push(
        await openDocument(`#!/bin/bash\nx${i}=1\necho "$y"`, "shellscript"),
      );
    }
    await Promise.all(
      documents.map((document) =>
        waitForDiagnostics(document, 15000, (diagnostics) =>
          has(diagnostics, "SC2034"),
        ),
      ),
    );
  });

  suiteTeardown(async () => {
    await closeAllEditors();
    await updateShellCheckSetting("exclude", undefined);
    await updateShellCheckSetting("maxConcurrentRuns", undefined);
    await updateShellCheckSetting("executablePath", undefined);
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  setup(() => {
    fs.rmSync(path.join(dir, "observed"), { force: true });
  });

  test("the default of 0 runs every document at once", async () => {
    await lintAllWithExclude(["2034"]);
    await lintAllWithExclude([]);

    assert.ok(
      Math.max(...observed()) > 1,
      `expected overlapping runs, observed ${observed()}`,
    );
  });

  test("1 runs one document at a time and still lints all of them", async () => {
    await updateShellCheckSetting("maxConcurrentRuns", 1);
    await lintAllWithExclude(["2034"]);
    await lintAllWithExclude([]);

    const runs = observed();
    assert.ok(
      runs.length >= 2 * DOCUMENTS,
      `expected every document linted twice, observed ${runs}`,
    );
    assert.deepStrictEqual(
      runs.filter((running) => running > 1),
      [],
      `expected no overlapping runs, observed ${runs}`,
    );
  });
});
