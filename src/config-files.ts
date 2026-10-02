import * as vscode from "vscode";
import { nativeRuntime } from "./runtime/native.js";
import { RuntimeKind } from "./runtime/types.js";
import { ShellCheckSettings } from "./settings.js";

const RC_NAMES = "{.shellcheckrc,shellcheckrc}";

export interface RcArgs {
  norc: boolean;
  rcfile: string | undefined;
}

export function parseRcArgs(args: readonly string[]): RcArgs {
  const result: RcArgs = { norc: false, rcfile: undefined };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--norc") {
      result.norc = true;
    } else if (arg === "--rcfile" && i + 1 < args.length) {
      result.rcfile = args[++i];
    } else if (arg.startsWith("--rcfile=")) {
      result.rcfile = arg.slice("--rcfile=".length);
    }
  }
  return result;
}

export type ConfigFileChange =
  /** An rc file that shellcheck finds by searching. `folder` is where it
   * lives, or undefined for a user-level one, which every document falls back
   * to. */
  | { kind: "search"; folder: vscode.Uri | undefined; nativeOnly: boolean }
  /** A file passed with `--rcfile`. */
  | { kind: "rcfile"; file: vscode.Uri };

export interface DocumentRc {
  uri: vscode.Uri;
  runtime: RuntimeKind;
  rcArgs: RcArgs;
  /** `rcArgs.rcfile` resolved against the document's working directory. */
  rcfile: vscode.Uri | undefined;
}

export function isAffected(
  change: ConfigFileChange,
  document: DocumentRc,
): boolean {
  if (document.rcArgs.norc) {
    return false;
  }
  if (change.kind === "rcfile") {
    return document.rcfile?.toString() === change.file.toString();
  }
  // `--rcfile` replaces the search altogether.
  if (document.rcArgs.rcfile !== undefined) {
    return false;
  }
  if (change.nativeOnly && document.runtime !== "native") {
    return false;
  }
  if (!change.folder) {
    return true;
  }
  // shellcheck searches from the script's folder upwards, so only documents
  // at or below the rc file's folder can pick it up.
  const { uri } = document;
  const folder = change.folder.path.endsWith("/")
    ? change.folder.path
    : `${change.folder.path}/`;
  return (
    uri.scheme === change.folder.scheme &&
    uri.authority === change.folder.authority &&
    uri.path.startsWith(folder)
  );
}

/**
 * Watches the rc files shellcheck reads, as far as
 * `shellcheck.watchConfigFiles.*` allows.
 */
export class ConfigFileWatcher implements vscode.Disposable {
  private watchers: vscode.Disposable[] = [];
  /** Keyed by `Uri.toString()`, filled lazily as lints come across them. */
  private readonly rcfileWatchers = new Map<string, vscode.Disposable>();
  private readonly folderListener: vscode.Disposable;
  private workspace = false;
  private user = false;

  constructor(private readonly onChange: (change: ConfigFileChange) => void) {
    this.folderListener = vscode.workspace.onDidChangeWorkspaceFolders(() =>
      this.update(),
    );
    this.update();
  }

  /** Rebuilds every watcher from the current settings. */
  public update(): void {
    this.disposeWatchers();
    const section = vscode.workspace.getConfiguration("shellcheck");
    const key = ShellCheckSettings.keys.watchConfigFiles;
    this.workspace = section.get(`${key}.workspace`, false);
    this.user =
      section.get(`${key}.user`, false) && nativeRuntime !== undefined;

    if (this.workspace) {
      this.watch(`**/${RC_NAMES}`, (uri) => ({
        kind: "search",
        folder: vscode.Uri.joinPath(uri, ".."),
        nativeOnly: false,
      }));
    }
    if (this.user) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (folder.uri.scheme !== "file") {
          continue;
        }
        // The wasm runtime only sees the workspace folder itself.
        for (const parent of nativeRuntime!.parentDirectories(
          folder.uri.fsPath,
        )) {
          this.watch(
            new vscode.RelativePattern(vscode.Uri.file(parent), RC_NAMES),
            () => ({
              kind: "search",
              folder: vscode.Uri.file(parent),
              nativeOnly: true,
            }),
          );
        }
      }
      for (const file of nativeRuntime!.userConfigFiles()) {
        const uri = vscode.Uri.file(file);
        this.watch(
          new vscode.RelativePattern(
            vscode.Uri.joinPath(uri, ".."),
            uri.path.slice(uri.path.lastIndexOf("/") + 1),
          ),
          () => ({ kind: "search", folder: undefined, nativeOnly: true }),
        );
      }
    }
  }

  /** Watches a file a document passes with `--rcfile`. */
  public watchRcfile(file: vscode.Uri): void {
    const key = file.toString();
    if (this.rcfileWatchers.has(key)) {
      return;
    }
    const inWorkspace = vscode.workspace.getWorkspaceFolder(file) !== undefined;
    if (!(inWorkspace ? this.workspace : this.user)) {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(file, ".."),
        file.path.slice(file.path.lastIndexOf("/") + 1),
      ),
    );
    const onEvent = () => this.onChange({ kind: "rcfile", file });
    this.rcfileWatchers.set(
      key,
      vscode.Disposable.from(
        watcher,
        watcher.onDidCreate(onEvent),
        watcher.onDidChange(onEvent),
        watcher.onDidDelete(onEvent),
      ),
    );
  }

  public dispose(): void {
    this.disposeWatchers();
    this.folderListener.dispose();
  }

  private watch(
    pattern: vscode.GlobPattern,
    change: (uri: vscode.Uri) => ConfigFileChange,
  ): void {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onEvent = (uri: vscode.Uri) => this.onChange(change(uri));
    this.watchers.push(
      watcher,
      watcher.onDidCreate(onEvent),
      watcher.onDidChange(onEvent),
      watcher.onDidDelete(onEvent),
    );
  }

  private disposeWatchers(): void {
    vscode.Disposable.from(
      ...this.watchers,
      ...this.rcfileWatchers.values(),
    ).dispose();
    this.watchers = [];
    this.rcfileWatchers.clear();
  }
}
