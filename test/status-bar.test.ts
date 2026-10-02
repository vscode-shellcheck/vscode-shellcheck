import assert from "node:assert";
import { SemVer } from "semver";
import * as vscode from "vscode";
import { RunTrigger } from "../src/settings.js";
import {
  menuItems,
  MenuItem,
  settingTarget,
  StatusSnapshot,
  statusBarView,
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
    assert.match(view.tooltip, /Run: onType/);

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
  test("offers the other runtime, the other run triggers and disabling", () => {
    assert.deepStrictEqual(actions(menuItems(nativeBundled)), [
      { kind: "command", command: "shellcheck.runLint" },
      { kind: "command", command: "shellcheck.collectDiagnostics" },
      { kind: "setRuntime", runtime: "wasm" },
      { kind: "pickTrigger" },
      { kind: "setEnabled", enabled: false },
      { kind: "openSettings" },
      { kind: "showOutput" },
    ]);
    assert.ok(
      actions(menuItems(wasm)).some(
        (a) => a.kind === "setRuntime" && a.runtime === "native",
      ),
    );
  });

  test("has no runtime to switch to where only wasm exists", () => {
    const items = menuItems({ ...wasm, canSwitchRuntime: false });
    assert.ok(!actions(items).some((a) => a.kind === "setRuntime"));
  });

  test("offers enabling a disabled document, and no lint for it", () => {
    const items = actions(menuItems({ ...nativeBundled, enabled: false }));
    assert.ok(items.some((a) => a.kind === "setEnabled" && a.enabled === true));
    assert.ok(
      !items.some(
        (a) => a.kind === "command" && a.command === "shellcheck.runLint",
      ),
    );
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
