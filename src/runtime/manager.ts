import * as vscode from "vscode";
import * as platform from "../platform/index.js";
import * as logging from "../utils/logging/index.js";
import { RuntimeKind, ShellCheckRunner, WasmRuntimeError } from "./types.js";

interface ActiveRunner {
  readonly kind: RuntimeKind;
  readonly runner: Promise<ShellCheckRunner>;
}

export function selectRuntimeKind(
  configured: string | undefined,
  web: boolean,
): RuntimeKind {
  return web || configured === "wasm" ? "wasm" : "native";
}

export class RuntimeManager implements vscode.Disposable {
  private active: ActiveRunner | undefined;
  private webRuntimeSettingNoticed = false;

  public constructor(private readonly context: vscode.ExtensionContext) {
    // Started here rather than on the first lint so the wasm module is
    // compiled before the user types.
    this.ensure();
  }

  public getRunner(): Promise<ShellCheckRunner> {
    return this.ensure();
  }

  /** Never starts a runner. */
  public cancel(documentKey: string): void {
    this.active?.runner.then(
      (runner) => runner.cancel(documentKey),
      () => {
        // A runner that never came up has nothing queued.
      },
    );
  }

  /** Swaps the runner when `shellcheck.runtime` changed. */
  public refresh(): void {
    this.ensure();
  }

  public dispose(): void {
    this.stop();
  }

  private ensure(): Promise<ShellCheckRunner> {
    const kind = this.getRuntimeKind();
    if (this.active?.kind !== kind) {
      this.stop();
      const runner = this.create(kind);
      // Every lint awaiting this runner sees the failure too; catching it here
      // keeps a startup failure from becoming an unhandled rejection.
      runner.catch((error: unknown) => {
        logging.error(
          "Unable to start the %s ShellCheck runtime: %O",
          kind,
          error,
        );
      });
      this.active = { kind, runner };
    }
    return this.active.runner;
  }

  private async create(kind: RuntimeKind): Promise<ShellCheckRunner> {
    if (kind !== "wasm") {
      return platform.createNativeRunner();
    }

    try {
      platform.assertWasmHostSupported();
      // Imported on demand: a native session must never evaluate the wasm
      // module graph, let alone read the 9.9 MiB module.
      const [{ WasmRunner }, { createPackagedShellCheck }] = await Promise.all([
        import("./wasm/wasm-runner.js"),
        import("./wasm/packaged.js"),
      ]);
      return new WasmRunner({
        shellcheck: await createPackagedShellCheck({
          extensionUri: this.context.extensionUri,
          logger: logging.logger,
        }),
        logger: logging.logger,
        activeDocumentKey: () =>
          vscode.window.activeTextEditor?.document.uri.toString(),
      });
    } catch (error) {
      if (error instanceof WasmRuntimeError) {
        throw error;
      }
      throw new WasmRuntimeError(
        "The experimental ShellCheck wasm runtime could not be loaded",
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }

  private getRuntimeKind(): RuntimeKind {
    // Window scoped, so one runner per window is always the right granularity.
    const configured = vscode.workspace
      .getConfiguration("shellcheck")
      .get<string>("runtime");
    if (
      platform.isWeb &&
      configured === "native" &&
      !this.webRuntimeSettingNoticed
    ) {
      this.webRuntimeSettingNoticed = true;
      logging.info(
        "shellcheck.runtime is ignored in VS Code for the Web, which only has the wasm runtime",
      );
    }
    return selectRuntimeKind(configured, platform.isWeb);
  }

  private stop(): void {
    const active = this.active;
    this.active = undefined;
    active?.runner.then(
      (runner) => runner.dispose(),
      () => {
        // A runner that never came up has nothing to dispose.
      },
    );
  }
}
