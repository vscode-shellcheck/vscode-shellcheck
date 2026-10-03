import assert from "node:assert";
import { SemVer } from "semver";
import * as vscode from "vscode";
import { RunTrigger } from "../src/settings.js";
import {
  menuItems,
  MenuItem,
  runtimeChoices,
  settingTarget,
  StatusSnapshot,
  statusBarView,
  triggerChoices,
} from "../src/status-bar.js";

const nativeBundled: StatusSnapshot = {
  runtime: "native",
  canSwitchRuntime: true,
  enabled: true,
  trigger: RunTrigger.onType,
  bundled: true,
  tool: { ok: true, version: new SemVer("0.11.0") },
};

const wasm: StatusSnapshot = {
  ...nativeBundled,
  runtime: "wasm",
  bundled: false,
  tool: { ok: true, version: new SemVer("0.11.0"), ghcVersion: "9.12.2" },
};

function actions(items: readonly MenuItem[]) {
  return items.flatMap((item) => (item.action ? [item.action] : []));
}

suite("Status bar", () => {
  test("shows the version and the runtime it runs on", () => {
    const view = statusBarView(nativeBundled);
    assert.strictEqual(view.state, "ok");
    assert.match(view.tooltip, /ShellCheck 0\.11\.0/);
    assert.match(view.tooltip, /Runtime: native \(bundled\)/);
    assert.match(view.tooltip, /Lint: On Type/);

    assert.match(statusBarView(wasm).tooltip, /Runtime: wasm \(GHC 9\.12\.2\)/);
  });

  test("a version still being probed is not a problem", () => {
    const view = statusBarView({ ...nativeBundled, tool: undefined });
    assert.strictEqual(view.state, "ok");
    assert.doesNotMatch(view.tooltip, /undefined/);
  });

  test("a shellcheck that cannot run is a problem", () => {
    const missing = statusBarView({
      ...nativeBundled,
      bundled: false,
      tool: { ok: false, reason: "executableNotFound" },
    });
    assert.strictEqual(missing.state, "problem");
    assert.match(missing.tooltip, /not found/);

    const broken = statusBarView({
      ...nativeBundled,
      tool: { ok: false, reason: "executionFailed" },
    });
    assert.strictEqual(broken.state, "problem");
    assert.match(broken.tooltip, /failed to run/);
  });

  test("a disabled document says so instead of being a problem", () => {
    const view = statusBarView({
      ...nativeBundled,
      enabled: false,
      tool: undefined,
    });
    assert.strictEqual(view.state, "disabled");
    assert.match(view.tooltip, /Disabled for this document/);
  });
});

suite("Status menu", () => {
  test("offers settings, the log, choosing the runtime and the trigger, disabling and diagnostics", () => {
    assert.deepStrictEqual(actions(menuItems(nativeBundled)), [
      { kind: "openSettings" },
      { kind: "showOutput" },
      { kind: "pickRuntime" },
      { kind: "pickTrigger" },
      { kind: "setEnabled", enabled: false },
      { kind: "command", command: "shellcheck.collectDiagnostics" },
    ]);
  });

  test("labels the settings with their current values", () => {
    const labels = menuItems(nativeBundled).map((item) => item.label);
    assert.ok(labels.includes("$(server-process) Runtime: native"));
    assert.ok(labels.includes("$(zap) Lint: On Type"));
    assert.ok(
      menuItems({ ...wasm, trigger: RunTrigger.manual })
        .map((item) => item.label)
        .includes("$(zap) Lint: Manually"),
    );
  });

  test("has no runtime to choose where only wasm exists", () => {
    const items = menuItems({ ...wasm, canSwitchRuntime: false });
    assert.ok(!actions(items).some((a) => a.kind === "pickRuntime"));
  });

  test("offers enabling a disabled document", () => {
    const items = actions(menuItems({ ...nativeBundled, enabled: false }));
    assert.ok(items.some((a) => a.kind === "setEnabled" && a.enabled === true));
  });

  test("only separators and actions, so every pick does something", () => {
    for (const item of menuItems(nativeBundled)) {
      assert.ok(
        item.kind === vscode.QuickPickItemKind.Separator || item.action,
        `${item.label} has no action`,
      );
    }
  });
});

suite("Status menu pickers", () => {
  test("offer every runtime and mark the current one", () => {
    const choices = runtimeChoices("wasm");
    assert.deepStrictEqual(
      choices.map((choice) => choice.value),
      ["native", "wasm"],
    );
    assert.deepStrictEqual(
      choices.map((choice) => choice.current),
      [false, true],
    );
  });

  test("offer every trigger and mark the current one", () => {
    const choices = triggerChoices(RunTrigger.onSave);
    assert.deepStrictEqual(
      choices.map((choice) => [choice.label, choice.value]),
      [
        ["On Type", RunTrigger.onType],
        ["On Save", RunTrigger.onSave],
        ["Manually", RunTrigger.manual],
      ],
    );
    assert.deepStrictEqual(
      choices.map((choice) => choice.current),
      [false, true, false],
    );
  });
});

suite("Status menu setting target", () => {
  const { Global, Workspace, WorkspaceFolder } = vscode.ConfigurationTarget;

  test("writes where the effective value comes from", () => {
    assert.strictEqual(
      settingTarget({ key: "k", workspaceFolderValue: false }, Global, true),
      WorkspaceFolder,
    );
    assert.strictEqual(
      settingTarget({ key: "k", workspaceValue: false }, Global, true),
      Workspace,
    );
  });

  test("falls back to the given target, or the user without a workspace", () => {
    assert.strictEqual(
      settingTarget({ key: "k", globalValue: false }, Workspace, true),
      Workspace,
    );
    assert.strictEqual(
      settingTarget({ key: "k", globalValue: false }, Global, true),
      Global,
    );
    assert.strictEqual(settingTarget(undefined, Workspace, false), Global);
  });
});
