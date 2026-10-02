import assert from "node:assert";
import * as vscode from "vscode";
import {
  announceOnce,
  USE_WASM_RUNTIME_COMMAND,
  useWasmRuntime,
  WALKTHROUGH_ID,
  WHATS_NEW_EDITION,
  WHATS_NEW_EDITION_KEY,
} from "../src/whats-new.js";
import { RuntimeKind } from "../src/runtime/types.js";

interface WalkthroughStep {
  id: string;
  description: string;
  media: { svg?: string };
  when?: string;
}

interface Walkthrough {
  id: string;
  steps: WalkthroughStep[];
}

function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

function extension(): vscode.Extension<unknown> {
  return vscode.extensions.getExtension("timonwong.shellcheck")!;
}

function walkthrough(): Walkthrough {
  const walkthroughs = extension().packageJSON.contributes
    .walkthroughs as Walkthrough[];
  const found = walkthroughs.find(
    (w) => `timonwong.shellcheck#${w.id}` === WALKTHROUGH_ID,
  );
  assert.ok(found, `no walkthrough contributes ${WALKTHROUGH_ID}`);
  return found;
}

suite("What's new", () => {
  test("announces on the first activation", async () => {
    let announced = 0;
    await announceOnce(memento(), async () => {
      announced++;
    });
    assert.strictEqual(announced, 1);
  });

  test("never announces the same edition again, whatever the version", async () => {
    const state = memento();
    let announced = 0;
    const announce = async () => {
      announced++;
    };
    await announceOnce(state, announce);
    await announceOnce(state, announce);
    assert.strictEqual(announced, 1);
  });

  test("announces an edition newer than the one last announced", async () => {
    const state = memento();
    await state.update(WHATS_NEW_EDITION_KEY, WHATS_NEW_EDITION - 1);
    let announced = 0;
    await announceOnce(state, async () => {
      announced++;
    });
    assert.strictEqual(announced, 1);
    assert.strictEqual(state.get(WHATS_NEW_EDITION_KEY), WHATS_NEW_EDITION);
  });

  test("does not announce after a newer edition was announced", async () => {
    // Another synced machine may run a newer extension version.
    const state = memento();
    await state.update(WHATS_NEW_EDITION_KEY, WHATS_NEW_EDITION + 1);
    let announced = 0;
    await announceOnce(state, async () => {
      announced++;
    });
    assert.strictEqual(announced, 0);
    assert.strictEqual(state.get(WHATS_NEW_EDITION_KEY), WHATS_NEW_EDITION + 1);
  });

  test("records the announcement before the user answers it", async () => {
    // A window reloaded while the notification is still open must not show it
    // again.
    const state = memento();
    await announceOnce(state, () => new Promise<never>(() => {}));
    assert.strictEqual(state.get(WHATS_NEW_EDITION_KEY), WHATS_NEW_EDITION);
  });

  test("a failed announcement is not retried", async () => {
    const state = memento();
    await announceOnce(state, async () => {
      throw new Error("no notifications today");
    });
    assert.strictEqual(state.get(WHATS_NEW_EDITION_KEY), WHATS_NEW_EDITION);
  });

  test("switching to wasm needs confirmation", async () => {
    const declined: RuntimeKind[] = [];
    await useWasmRuntime(
      async () => false,
      async (runtime) => {
        declined.push(runtime);
      },
    );
    const confirmed: RuntimeKind[] = [];
    await useWasmRuntime(
      async () => true,
      async (runtime) => {
        confirmed.push(runtime);
      },
    );
    assert.deepStrictEqual(declined, []);
    assert.deepStrictEqual(confirmed, ["wasm"]);
  });

  test("every illustration is shipped and themed", async () => {
    for (const step of walkthrough().steps) {
      assert.ok(step.media.svg, `step ${step.id} has no svg media`);
      const uri = vscode.Uri.joinPath(extension().extensionUri, step.media.svg);
      const svg = new TextDecoder().decode(
        await vscode.workspace.fs.readFile(uri),
      );
      // media.svg runs under a CSP that drops <style> and style="".
      assert.doesNotMatch(svg, /<style|\sstyle=/, step.media.svg);
      assert.match(svg, /var\(--vscode-/, step.media.svg);
    }
  });

  test("every walkthrough button runs a registered command", async () => {
    await extension().activate();
    const commands = new Set(await vscode.commands.getCommands(true));
    for (const step of walkthrough().steps) {
      for (const [, command] of step.description.matchAll(
        /\(command:([\w.]+)/g,
      )) {
        assert.ok(commands.has(command), `${command} in step ${step.id}`);
      }
    }
  });

  test("the runtime switch is not offered on the web", () => {
    // The web build only has the wasm runtime.
    const steps = walkthrough().steps.filter((step) =>
      step.description.includes(`command:${USE_WASM_RUNTIME_COMMAND}`),
    );
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].when, "!isWeb");
  });
});
