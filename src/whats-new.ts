import * as vscode from "vscode";
import { RuntimeKind } from "./runtime/types.js";
import { ShellCheckSettings } from "./settings.js";
import * as logging from "./utils/logging/index.js";

export const WALKTHROUGH_ID = "timonwong.shellcheck#whatsNew";
export const WHATS_NEW_SHOWN_KEY = "whatsNewShown";
export const USE_WASM_RUNTIME_COMMAND = "shellcheck.useWasmRuntime";

const SEE_WHATS_NEW = "See What's New";

/**
 * Runs `announce` unless any earlier activation did, on any synced machine.
 *
 * The flag is written before announcing and the announcement is not awaited,
 * so a notification left open across a reload, or one that fails, is not
 * shown again.
 */
export async function announceOnce(
  state: vscode.Memento,
  announce: () => Thenable<unknown>,
): Promise<void> {
  if (state.get<boolean>(WHATS_NEW_SHOWN_KEY)) {
    return;
  }
  await state.update(WHATS_NEW_SHOWN_KEY, true);
  Promise.resolve(announce()).catch((error: unknown) => {
    logging.error("Unable to announce what's new: %O", error);
  });
}

export async function useWasmRuntime(
  confirm: () => Thenable<boolean>,
  setRuntime: (runtime: RuntimeKind) => Thenable<void>,
): Promise<void> {
  if (await confirm()) {
    await setRuntime("wasm");
  }
}

async function confirmWasmRuntime(): Promise<boolean> {
  const switchLabel = "Switch to WebAssembly";
  const selected = await vscode.window.showWarningMessage(
    "Switch ShellCheck to the experimental WebAssembly runtime?",
    {
      modal: true,
      detail: [
        "It checks scripts 3-4x slower than the native binary.",
        "It never falls back to the native binary: if it fails, scripts are not checked until you switch back.",
        "It reads only files inside the document's workspace folder, so source targets and .shellcheckrc files outside it are not found.",
        "shellcheck.executablePath is ignored, and paths in shellcheck.customArgs are not resolved.",
      ].join("\n\n"),
    },
    switchLabel,
  );
  return selected === switchLabel;
}

export function registerWhatsNew(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  context.globalState.setKeysForSync([WHATS_NEW_SHOWN_KEY]);
  void announceOnce(context.globalState, async () => {
    const selected = await vscode.window.showInformationMessage(
      "ShellCheck now has a status bar menu, runs in VS Code for the Web, and bundles a WebAssembly build.",
      SEE_WHATS_NEW,
    );
    if (selected === SEE_WHATS_NEW) {
      await vscode.commands.executeCommand(
        "workbench.action.openWalkthrough",
        WALKTHROUGH_ID,
        false,
      );
    }
  });

  return vscode.commands.registerCommand(USE_WASM_RUNTIME_COMMAND, () =>
    useWasmRuntime(confirmWasmRuntime, (runtime) =>
      vscode.workspace
        .getConfiguration("shellcheck")
        .update(
          ShellCheckSettings.keys.runtime,
          runtime,
          vscode.ConfigurationTarget.Global,
        ),
    ),
  );
}
