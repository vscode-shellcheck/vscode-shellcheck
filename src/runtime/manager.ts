import * as vscode from "vscode";
import * as logging from "../utils/logging/index.js";
import { NativeRunner } from "./native-runner.js";
import { RuntimeKind, ShellCheckRunner, WasmRuntimeError } from "./types.js";

interface ActiveRunner {
  readonly kind: RuntimeKind;
  readonly runner: Promise<ShellCheckRunner>;
}

function getRuntimeKind(): RuntimeKind {
  // Window scoped, so one runner per window is always the right granularity.
  const configured = vscode.workspace
    .getConfiguration("shellcheck")
    .get<string>("runtime");
  return configured === "wasm" ? "wasm" : "native";
}

export class RuntimeManager implements vscode.Disposable {
  private active: ActiveRunner | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {
    // Started here rather than on the first lint so the wasm worker and its
    // module are ready before the user types.
    this.ensure();
  }

  public getRunner(): Promise<ShellCheckRunner> {
    return this.ensure();
  }

  /** Swaps the runner when `shellcheck.runtime` changed. */
  public refresh(): void {
    this.ensure();
  }

  public dispose(): void {
    this.stop();
  }

  private ensure(): Promise<ShellCheckRunner> {
    const kind = getRuntimeKind();
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
      return new NativeRunner();
    }

    try {
      // Imported on demand: a native session must never evaluate the wasm
      // module graph, let alone read the 9.9 MiB module.
      const { WasmRunner, loadPackagedModule } =
        await import("./wasm/wasm-runner.js");
      return new WasmRunner({
        workerPath: vscode.Uri.joinPath(
          this.context.extensionUri,
          "dist",
          "wasm-worker.js",
        ).fsPath,
        loadModule: loadPackagedModule,
        logger: logging.logger,
      });
    } catch (error) {
      throw new WasmRuntimeError(
        "The experimental ShellCheck wasm runtime could not be loaded",
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
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
