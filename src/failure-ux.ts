import { RuntimeKind, WasmRuntimeError } from "./runtime/types.js";

/**
 * Item titles are also their identity: a notification hands back the chosen
 * title and nothing else.
 */
export const FailureActions = {
  ok: "OK",
  installationGuide: "Installation Guide",
  tryWasmRuntime: "Try experimental WASM runtime",
  switchBackToNative: "Switch back to native",
  showLog: "Show Log",
} as const;

export const INSTALLATION_GUIDE_URL =
  "https://github.com/koalaman/shellcheck#installing";

/** An error notification: the text and the items offered with it. */
export interface FailureNotification {
  readonly message: string;
  readonly items: readonly string[];
}

/** What picking an item on an error notification has to do. */
export type FailureEffect =
  | { readonly kind: "dismiss" }
  | { readonly kind: "openUrl"; readonly url: string }
  | { readonly kind: "setRuntime"; readonly runtime: RuntimeKind }
  | { readonly kind: "showLog" };

/** The side effects an item can have, so the mapping above stays testable. */
export interface FailureActionHost {
  openUrl(url: string): Promise<void>;
  /** Writes `shellcheck.runtime` at global (user) scope, and nothing else. */
  setRuntime(runtime: RuntimeKind): Promise<void>;
  /** Reveals the ShellCheck output channel. */
  showLog(): void;
}

/**
 * The notification for a shellcheck program that could not be run.
 *
 * No `Show Log` item here: these failures carry their whole message in the
 * notification and log their details at debug level, which is below the default
 * `shellcheck.logLevel`, so the channel would open on nothing.
 */
export function describeShellCheckError(
  error: unknown,
  runtime: RuntimeKind,
): FailureNotification {
  if (error instanceof Error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      const items: string[] = [
        FailureActions.ok,
        FailureActions.installationGuide,
      ];
      // Offering a runtime that needs no program only helps where a missing
      // program is what stopped the lint.
      if (runtime === "native") {
        items.push(FailureActions.tryWasmRuntime);
      }
      return {
        message:
          "The shellcheck program was not found (not installed?). Use the 'shellcheck.executablePath' setting to configure the location of 'shellcheck'",
        items,
      };
    }
    return {
      message: `Failed to run shellcheck: [${e.code}] ${e.message}`,
      items: [],
    };
  }

  return { message: "Failed to run shellcheck: unknown error", items: [] };
}

/** The notification for a failure of the experimental WASM runtime itself. */
export function describeWasmFailure(
  error: WasmRuntimeError,
): FailureNotification {
  return {
    message: `${error.message}. Shell scripts are not being checked.`,
    // The full details of every wasm failure are logged at error level, so the
    // output channel is always worth opening here.
    items: [FailureActions.switchBackToNative, FailureActions.showLog],
  };
}

export function effectOfSelection(selected: string | undefined): FailureEffect {
  switch (selected) {
    case FailureActions.installationGuide:
      return { kind: "openUrl", url: INSTALLATION_GUIDE_URL };
    case FailureActions.tryWasmRuntime:
      return { kind: "setRuntime", runtime: "wasm" };
    case FailureActions.switchBackToNative:
      return { kind: "setRuntime", runtime: "native" };
    case FailureActions.showLog:
      return { kind: "showLog" };
    default:
      return { kind: "dismiss" };
  }
}

export async function applyFailureEffect(
  effect: FailureEffect,
  host: FailureActionHost,
): Promise<void> {
  switch (effect.kind) {
    case "openUrl":
      await host.openUrl(effect.url);
      break;
    case "setRuntime":
      await host.setRuntime(effect.runtime);
      break;
    case "showLog":
      host.showLog();
      break;
    case "dismiss":
      break;
  }
}

/**
 * Decides whether a WASM runtime failure still deserves a notification.
 *
 * The runtime never falls back to the native program, so a broken module would
 * otherwise fail every lint with a fresh popup. A settings change deliberately
 * does not reset this: toggling the runtime back and forth must not restart the
 * popups either. Failures always reach the output channel regardless.
 */
export class WasmFailureNotifier {
  private notified = false;

  public notificationFor(
    error: WasmRuntimeError,
  ): FailureNotification | undefined {
    if (this.notified) {
      return undefined;
    }
    this.notified = true;
    return describeWasmFailure(error);
  }
}
