import assert from "node:assert";
import {
  applyFailureEffect,
  describeShellCheckError,
  describeWasmFailure,
  effectOfSelection,
  FailureAction,
  FailureActionHost,
  FailureNotification,
  INSTALLATION_GUIDE_URL,
  WasmFailureNotifier,
} from "../src/failure-ux.js";
import { RuntimeKind, WasmRuntimeError } from "../src/runtime/types.js";

function notFound(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    "spawn /nowhere/shellcheck ENOENT",
  );
  error.code = "ENOENT";
  return error;
}

function actions(notification: FailureNotification): FailureAction[] {
  return notification.items.map((item) => item.action);
}

function recordingHost(): FailureActionHost & {
  urls: string[];
  runtimes: RuntimeKind[];
  logsShown: number;
} {
  const urls: string[] = [];
  const runtimes: RuntimeKind[] = [];
  const host = {
    urls,
    runtimes,
    logsShown: 0,
    openUrl: async (url: string) => {
      urls.push(url);
    },
    setRuntime: async (runtime: RuntimeKind) => {
      runtimes.push(runtime);
    },
    showLog: () => {
      host.logsShown++;
    },
  };
  return host;
}

suite("Failure UX", () => {
  test("a missing program offers the experimental runtime in native mode", () => {
    const notification = describeShellCheckError(notFound(), "native");
    // No `Show Log`: a missing program logs its details below the default log
    // level, so the channel would have nothing to show.
    assert.deepStrictEqual(actions(notification), [
      "ok",
      "installationGuide",
      "tryWasmRuntime",
    ]);
    assert.match(notification.message, /^The shellcheck program was not found/);
  });

  test("a missing program does not offer the experimental runtime in wasm mode", () => {
    const notification = describeShellCheckError(notFound(), "wasm");
    assert.deepStrictEqual(actions(notification), ["ok", "installationGuide"]);
  });

  test("other failures keep their message and offer nothing", () => {
    const error: NodeJS.ErrnoException = new Error("denied");
    error.code = "EACCES";
    assert.deepStrictEqual(describeShellCheckError(error, "native"), {
      message: "Failed to run shellcheck: [EACCES] denied",
      items: [],
    });
    assert.deepStrictEqual(describeShellCheckError("nope", "native"), {
      message: "Failed to run shellcheck: unknown error",
      items: [],
    });
  });

  test("each item maps to its effect", () => {
    assert.deepStrictEqual(effectOfSelection("tryWasmRuntime"), {
      kind: "setRuntime",
      runtime: "wasm",
    });
    assert.deepStrictEqual(effectOfSelection("switchBackToNative"), {
      kind: "setRuntime",
      runtime: "native",
    });
    assert.deepStrictEqual(effectOfSelection("installationGuide"), {
      kind: "openUrl",
      url: INSTALLATION_GUIDE_URL,
    });
    assert.deepStrictEqual(effectOfSelection("showLog"), {
      kind: "showLog",
    });
    // Dismissing the notification resolves to undefined.
    for (const selected of ["ok", undefined] as const) {
      assert.deepStrictEqual(effectOfSelection(selected), { kind: "dismiss" });
    }
  });

  test("the runtime items switch the runtime and do nothing else", async () => {
    const host = recordingHost();
    await applyFailureEffect(effectOfSelection("tryWasmRuntime"), host);
    await applyFailureEffect(effectOfSelection("switchBackToNative"), host);
    assert.deepStrictEqual(host.runtimes, ["wasm", "native"]);
    assert.deepStrictEqual(host.urls, []);
    assert.strictEqual(host.logsShown, 0);
  });

  test("the log item reveals the output and does nothing else", async () => {
    const host = recordingHost();
    await applyFailureEffect(effectOfSelection("showLog"), host);
    assert.strictEqual(host.logsShown, 1);
    assert.deepStrictEqual(host.runtimes, []);
    assert.deepStrictEqual(host.urls, []);
  });

  test("a dismissed notification has no effect", async () => {
    const host = recordingHost();
    await applyFailureEffect(effectOfSelection(undefined), host);
    assert.deepStrictEqual(host.runtimes, []);
    assert.deepStrictEqual(host.urls, []);
    assert.strictEqual(host.logsShown, 0);
  });

  test("a wasm failure is shown once per session", () => {
    const notifier = new WasmFailureNotifier(true);
    const first = notifier.notificationFor(
      new WasmRuntimeError(
        "The bundled ShellCheck wasm module could not be loaded",
        "detail",
      ),
    );
    assert.ok(first);
    assert.deepStrictEqual(actions(first), ["switchBackToNative", "showLog"]);
    assert.strictEqual(
      first.message,
      "The bundled ShellCheck wasm module could not be loaded. Shell scripts are not being checked.",
    );

    // A different failure kind, and a later one of the same kind, stay silent.
    assert.strictEqual(
      notifier.notificationFor(
        new WasmRuntimeError("ShellCheck (wasm) timed out after 30000 ms"),
      ),
      undefined,
    );
    assert.strictEqual(
      notifier.notificationFor(
        new WasmRuntimeError(
          "The bundled ShellCheck wasm module could not be loaded",
        ),
      ),
      undefined,
    );
  });

  test("a wasm failure only offers the log on the web", () => {
    const notification = describeWasmFailure(
      new WasmRuntimeError("The ShellCheck wasm runtime failed", "detail"),
      false,
    );
    assert.deepStrictEqual(actions(notification), ["showLog"]);
  });
});
