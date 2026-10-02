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
  /** A file passed with `--rcfile`, and the documents that pass it. */
  | { kind: "rcfile"; documents: ReadonlySet<string> };

export interface DocumentRc {
  uri: vscode.Uri;
  runtime: RuntimeKind;
  rcArgs: RcArgs;
}

export function isAffected(
  change: ConfigFileChange,
  document: DocumentRc,
): boolean {
  if (document.rcArgs.norc) {
    return false;
  }
  if (change.kind === "rcfile") {
    return change.documents.has(document.uri.toString());
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

interface RcfileWatch {
  watcher: vscode.Disposable;
  documents: Set<string>;
}

/**
 * Watches the rc files shellcheck reads, as far as
 * `shellcheck.watchConfigFiles.*` allows.
 */
export class ConfigFileWatcher implements vscode.Disposable {
  private searchWatchers: vscode.Disposable[] = [];
  /** Keyed by `Uri.toString()`, filled as native lints come across them. */
  private readonly rcfileWatches = new Map<string, RcfileWatch>();
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
      this.watchSearch(`**/${RC_NAMES}`, (uri) => ({
        kind: "search",
        folder: vscode.Uri.joinPath(uri, ".."),
        nativeOnly: false,
      }));
    }
    if (!this.user) {
      return;
    }
    // The wasm runtime only sees the workspace folder itself, so everything
    // from here on is native only.
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== "file") {
        continue;
      }
      for (const parent of nativeRuntime!.parentDirectories(
        folder.uri.fsPath,
      )) {
        const change: ConfigFileChange = {
          kind: "search",
          folder: vscode.Uri.file(parent),
          nativeOnly: true,
        };
        this.watchSearch(
          new vscode.RelativePattern(change.folder!, RC_NAMES),
          () => change,
        );
      }
    }
    for (const file of nativeRuntime!.userConfigFiles()) {
      this.watchSearch(
        new vscode.RelativePattern(vscode.Uri.file(file), "*"),
        () => ({ kind: "search", folder: undefined, nativeOnly: true }),
      );
    }
  }

  /** Watches the file `document` passes with `--rcfile`. */
  public watchRcfile(file: vscode.Uri, document: vscode.Uri): void {
    const key = file.toString();
    let watch = this.rcfileWatches.get(key);
    if (!watch) {
      const inWorkspace =
        vscode.workspace.getWorkspaceFolder(file) !== undefined;
      if (!(inWorkspace ? this.workspace : this.user)) {
        return;
      }
      const documents = new Set<string>();
      watch = {
        documents,
        watcher: this.watch(new vscode.RelativePattern(file, "*"), () =>
          this.onChange({ kind: "rcfile", documents }),
        ),
      };
      this.rcfileWatches.set(key, watch);
    }
    watch.documents.add(document.toString());
  }

  public dispose(): void {
    this.disposeWatchers();
    this.folderListener.dispose();
  }

  private watchSearch(
    pattern: vscode.GlobPattern,
    change: (uri: vscode.Uri) => ConfigFileChange,
  ): void {
    this.searchWatchers.push(
      this.watch(pattern, (uri) => this.onChange(change(uri))),
    );
  }

  private watch(
    pattern: vscode.GlobPattern,
    onEvent: (uri: vscode.Uri) => void,
  ): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    return vscode.Disposable.from(
      watcher,
      watcher.onDidCreate(onEvent),
      watcher.onDidChange(onEvent),
      watcher.onDidDelete(onEvent),
    );
  }

  private disposeWatchers(): void {
    for (const watcher of this.searchWatchers) {
      watcher.dispose();
    }
    for (const { watcher } of this.rcfileWatches.values()) {
      watcher.dispose();
    }
    this.searchWatchers = [];
    this.rcfileWatches.clear();
  }
}
