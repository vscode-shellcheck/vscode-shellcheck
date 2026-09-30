import assert from "node:assert";
import { RuntimeKind } from "../src/runtime/types.js";
import {
  NormalizedDiagnostic,
  normalize,
  PARITY_FIXTURES,
  ParityFixture,
} from "./parity-fixtures.js";
import {
  closeAllEditors,
  lintActiveDocument,
  openWorkspaceDocument,
  resetRuntime,
  RUNTIMES,
  setRuntime,
  updateShellCheckSetting,
} from "./helpers.js";

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

  for (const fixture of PARITY_FIXTURES) {
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
