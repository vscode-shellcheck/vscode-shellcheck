import assert from "node:assert";
import * as vscode from "vscode";
import { RuntimeKind } from "../src/runtime/types.js";
import {
  closeAllEditors,
  lintActiveDocument,
  openWorkspaceDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  updateShellCheckSetting,
} from "./helpers.js";

/** A diagnostic reduced to the parts a runtime is allowed to influence. */
interface NormalizedDiagnostic {
  code: string | number | undefined;
  message: string;
  severity: string;
  /** `[startLine, startCharacter, endLine, endCharacter]`, all zero-based. */
  range: [number, number, number, number];
  tags: string[];
}

interface ParityFixture {
  readonly title: string;
  /** Relative to the workspace folder, which is the preopen root in wasm mode. */
  readonly path: string;
  readonly customArgs?: readonly string[];
  /**
   * The findings the fixture must produce, so that two runtimes agreeing on an
   * empty or unrelated result cannot pass as parity.
   */
  readonly expected: readonly { code: string; line: number }[];
}

const fixtures: readonly ParityFixture[] = [
  {
    title: "a plain script",
    path: "plain/plain.sh",
    expected: [{ code: "SC2086", line: 1 }],
  },
  {
    title: "a script relying on a parent-directory .shellcheckrc",
    // SC2034 for `declared_but_unused` is missing here only because the
    // `disable=SC2034` two directories up is found. The fixture below is the
    // control: the same code, with the upward walk stopped one level short.
    path: "rc/child/nested/uses-rc.sh",
    expected: [{ code: "SC2086", line: 2 }],
  },
  {
    title: "a nearer .shellcheckrc that stops the upward walk",
    path: "rc/nearest/ignores-parent.sh",
    expected: [
      { code: "SC2034", line: 1 },
      { code: "SC2086", line: 2 },
    ],
  },
  {
    title: "a script sourcing another directory with -x",
    // SC1091 for the unfollowed `source` is missing here only because
    // `../lib/util.sh` resolved relative to the document's own directory.
    path: "src/sources.sh",
    customArgs: ["-x"],
    expected: [{ code: "SC2086", line: 4 }],
  },
];

function normalize(
  diagnostics: readonly vscode.Diagnostic[],
): NormalizedDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code:
      typeof diagnostic.code === "object"
        ? diagnostic.code.value
        : diagnostic.code,
    message: diagnostic.message,
    severity: vscode.DiagnosticSeverity[diagnostic.severity],
    range: [
      diagnostic.range.start.line,
      diagnostic.range.start.character,
      diagnostic.range.end.line,
      diagnostic.range.end.character,
    ],
    tags: (diagnostic.tags ?? []).map((tag) => vscode.DiagnosticTag[tag]),
  }));
}

async function lintUnder(
  runtime: RuntimeKind,
  fixture: ParityFixture,
): Promise<NormalizedDiagnostic[]> {
  // Switching runtimes re-lints every open document, so closing first keeps a
  // result produced by the previous runtime from landing on the document this
  // is about to measure.
  await closeAllEditors();
  await setRuntime(runtime);
  const document = await openWorkspaceDocument(fixture.path);
  return normalize(await lintActiveDocument(document));
}

suite("WebAssembly runtime parity", () => {
  suiteTeardown(async () => {
    await closeAllEditors();
    await resetRuntime();
    await updateShellCheckSetting("customArgs", undefined);
  });

  for (const fixture of fixtures) {
    test(`Both runtimes report the same diagnostics for ${fixture.title}`, async () => {
      await updateShellCheckSetting("customArgs", fixture.customArgs);

      const byRuntime = new Map<RuntimeKind, NormalizedDiagnostic[]>();
      for (const runtime of RUNTIMES) {
        byRuntime.set(runtime, await lintUnder(runtime, fixture));
      }

      const native = byRuntime.get("native")!;
      assert.deepStrictEqual(
        native.map(({ code, range }) => ({ code, line: range[0] })),
        fixture.expected,
      );
      assert.deepStrictEqual(byRuntime.get("wasm"), native);
    });
  }
});
