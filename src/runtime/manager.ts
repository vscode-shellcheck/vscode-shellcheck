import * as vscode from "vscode";
import { NativeRunner } from "./native-runner.js";
import { ShellCheckRunner } from "./types.js";

export class RuntimeManager implements vscode.Disposable {
  private runner: ShellCheckRunner | undefined;

  public getRunner(): ShellCheckRunner {
    if (!this.runner) {
      this.runner = new NativeRunner();
    }
    return this.runner;
  }

  public dispose(): void {
    this.runner?.dispose();
    this.runner = undefined;
  }
}
