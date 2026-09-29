import fs from "node:fs/promises";
import os from "node:os";
import util from "node:util";
import { dirname } from "node:path";
import { Worker } from "node:worker_threads";
import type { WorkerPort } from "@vscode-shellcheck/shellcheck-wasm/client";
import { execa } from "execa";
import { lt as semVerLt, SemVer } from "semver";
import * as vscode from "vscode";
import { version as BUNDLED_TOOL_VERSION } from "../../bindl.config.js";
import { NativeRunner } from "../runtime/native-runner.js";
import { ShellCheckRunner } from "../runtime/types.js";
import * as logging from "../utils/logging/index.js";
import { Logger } from "../utils/logging/types.js";
import { getWorkspaceFolderPath, substitutePath } from "../utils/path.js";
import { parseToolVersion } from "../utils/tool-check.js";

export interface Executable {
  path: string;
  bundled: boolean;
}

export const isWeb: boolean = false;

export function formatLogMessage(format: string, ...args: unknown[]): string {
  return util.format(format, ...args);
}

export async function resolveExecutable(
  context: vscode.ExtensionContext,
  executablePath: string | undefined,
): Promise<Executable> {
  if (!executablePath) {
    // Use bundled binaries (maybe)
    const suffix = process.platform === "win32" ? ".exe" : "";
    executablePath = context.asAbsolutePath(
      `./binaries/${process.platform}/${process.arch}/shellcheck${suffix}`,
    );
    try {
      await fs.access(executablePath, fs.constants.X_OK);
      return { path: executablePath, bundled: true };
    } catch (error) {
      return {
        path: "shellcheck", // Fallback to default shellcheck path.
        bundled: false,
      };
    }
  }

  return { path: substitutePath(executablePath), bundled: false };
}

export async function getToolVersion(executable: string): Promise<SemVer> {
  logging.debug(`Spawn: ${executable} -V`);
  const { stdout } = await execa(executable, ["-V"], { timeout: 5000 });

  return parseToolVersion(stdout);
}

export function tryPromptForUpdatingTool(version: SemVer) {
  const disableVersionCheckUpdateSetting =
    new DisableVersionCheckUpdateSetting();
  if (!disableVersionCheckUpdateSetting.isDisabled) {
    if (semVerLt(version, BUNDLED_TOOL_VERSION)) {
      promptForUpdatingTool(version.format(), disableVersionCheckUpdateSetting);
    }
  }
}

export function createNativeRunner(): ShellCheckRunner {
  return new NativeRunner();
}

export function homeDirectory(): string | undefined {
  return fixDriveCasingInWindows(os.homedir());
}

// Stolen from vscode-go: https://github.com/golang/vscode-go/blob/46048018519b6f727e920f5f5a4335acc436bdd3/extension/src/utils/pathUtils.ts#L246-L251
// Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
export function fixDriveCasingInWindows(pathToFix: string): string {
  return process.platform === "win32" && pathToFix
    ? pathToFix.substring(0, 1).toUpperCase() + pathToFix.substring(1)
    : pathToFix;
}

export function guessDocumentDirname(
  textDocument: vscode.TextDocument,
): string | undefined {
  if (textDocument.isUntitled) {
    return getWorkspaceFolderPath(textDocument.uri);
  }

  if (textDocument.uri.scheme === "file") {
    return dirname(textDocument.fileName);
  }

  return undefined;
}

export async function ensureCurrentWorkingDirectory(
  cwd: string | undefined,
): Promise<string | undefined> {
  if (!cwd) {
    return undefined;
  }

  try {
    const fstat = await fs.stat(cwd);
    if (!fstat.isDirectory()) {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }

  return cwd;
}

export function nativeWorkingDirectory(
  textDocument: vscode.TextDocument,
  useWorkspaceRootAsCwd: boolean,
): Promise<string | undefined> {
  return ensureCurrentWorkingDirectory(
    useWorkspaceRootAsCwd
      ? getWorkspaceFolderPath(textDocument.uri)
      : guessDocumentDirname(textDocument),
  );
}

export function startWasmWorker(
  extensionUri: vscode.Uri,
  logger: Logger,
): WorkerPort {
  const workerPath = vscode.Uri.joinPath(
    extensionUri,
    "dist",
    "wasm-worker.js",
  ).fsPath;
  const worker = new Worker(workerPath);
  const threadId = worker.threadId;
  logger.debug("ShellCheck (wasm): worker %d started", threadId);
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (listener) => worker.on("message", listener),
    onError: (listener) => worker.on("error", listener),
    onExit: (listener) => worker.on("exit", listener),
    terminate: async () => {
      await worker.terminate();
      logger.debug("ShellCheck (wasm): worker %d terminated", threadId);
    },
  };
}

export function assertWasmHostSupported(): void {}

class DisableVersionCheckUpdateSetting {
  private static KEY = "disableVersionCheck";
  private config: vscode.WorkspaceConfiguration;
  readonly isDisabled: boolean;

  constructor() {
    this.config = vscode.workspace.getConfiguration("shellcheck", null);
    this.isDisabled =
      this.config.get(DisableVersionCheckUpdateSetting.KEY) || false;
  }

  persist() {
    this.config.update(DisableVersionCheckUpdateSetting.KEY, true, true);
  }
}

async function promptForUpdatingTool(
  currentVersion: string,
  disableVersionCheckUpdateSetting: DisableVersionCheckUpdateSetting,
) {
  const selected = await vscode.window.showInformationMessage(
    `The ShellCheck extension is better with a newer version of "shellcheck" (you got v${currentVersion}, v${BUNDLED_TOOL_VERSION} or newer is recommended)`,
    "Don't Show Again",
    "Update",
  );
  switch (selected) {
    case "Don't Show Again":
      disableVersionCheckUpdateSetting.persist();
      break;
    case "Update":
      vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/koalaman/shellcheck#installing"),
      );
      break;
  }
}
