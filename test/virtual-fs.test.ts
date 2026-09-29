import assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAllEditors,
  lintActiveDocument,
  resetRuntime,
  setRuntime,
} from "./helpers.js";

const SCHEME = "shellcheck-test";

/** Just enough of a file system to open documents from, recording reads. */
class MemoryFileSystem implements vscode.FileSystemProvider {
  public readonly reads: string[] = [];
  private readonly files = new Map<string, Uint8Array>();
  private readonly directories = new Set<string>(["/"]);
  private readonly changes = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();

  public readonly onDidChangeFile = this.changes.event;

  public add(path: string, content: string): void {
    const segments = path.split("/").slice(1, -1);
    segments.forEach((_, i) =>
      this.directories.add(`/${segments.slice(0, i + 1).join("/")}`),
    );
    this.files.set(path, new TextEncoder().encode(content));
  }

  public watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  public stat(uri: vscode.Uri): vscode.FileStat {
    const file = this.files.get(uri.path);
    if (file) {
      return {
        type: vscode.FileType.File,
        ctime: 0,
        mtime: 0,
        size: file.length,
      };
    }
    if (this.directories.has(uri.path)) {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const prefix = uri.path === "/" ? "/" : `${uri.path}/`;
    const children = (paths: Iterable<string>, type: vscode.FileType) =>
      [...paths]
        .filter((path) => path !== "/" && path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes("/"))
        .map((name): [string, vscode.FileType] => [name, type]);
    return [
      ...children(this.directories, vscode.FileType.Directory),
      ...children(this.files.keys(), vscode.FileType.File),
    ];
  }

  public readFile(uri: vscode.Uri): Uint8Array {
    this.reads.push(uri.path);
    const file = this.files.get(uri.path);
    if (!file) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return file;
  }

  public writeFile(): void {
    throw vscode.FileSystemError.NoPermissions();
  }

  public createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions();
  }

  public delete(): void {
    throw vscode.FileSystemError.NoPermissions();
  }

  public rename(): void {
    throw vscode.FileSystemError.NoPermissions();
  }
}

const script = `#!/bin/bash
# shellcheck source=lib.sh
source ./lib.sh
unused=1
echo "$greeting" $1
`;

async function lintDocument(path: string): Promise<[string, number][]> {
  let document = await vscode.workspace.openTextDocument(
    vscode.Uri.from({ scheme: SCHEME, path }),
  );
  document = await vscode.languages.setTextDocumentLanguage(
    document,
    "shellscript",
  );
  await vscode.window.showTextDocument(document);
  const diagnostics = await lintActiveDocument(document);
  return diagnostics.map((diagnostic) => [
    typeof diagnostic.code === "object"
      ? String(diagnostic.code.value)
      : String(diagnostic.code),
    diagnostic.range.start.line,
  ]);
}

suite("WebAssembly runtime on a virtual file system", function () {
  // A wasm cold start on top of the lint itself.
  this.timeout(30000);

  const memory = new MemoryFileSystem();
  let registration: vscode.Disposable;

  suiteSetup(async () => {
    memory.add(
      "/proj/.shellcheckrc",
      "external-sources=true\ndisable=SC2034\n",
    );
    memory.add("/proj/lib.sh", "greeting=hi\n");
    memory.add("/proj/script.sh", script);
    // The same script with no `.shellcheckrc` beside it.
    memory.add("/bare/lib.sh", "greeting=hi\n");
    memory.add("/bare/script.sh", script);
    registration = vscode.workspace.registerFileSystemProvider(SCHEME, memory, {
      isCaseSensitive: true,
    });
    await setRuntime("wasm");
  });

  suiteTeardown(async () => {
    await closeAllEditors();
    await resetRuntime();
    registration.dispose();
  });

  test("reads .shellcheckrc and sourced files through the provider", async () => {
    // SC2034 is disabled by the rc, and SC1091 and SC2154 are missing because
    // lib.sh was followed, as the rc's external-sources allows.
    assert.deepStrictEqual(await lintDocument("/proj/script.sh"), [
      ["SC2086", 4],
    ]);
    assert.ok(memory.reads.includes("/proj/.shellcheckrc"), `${memory.reads}`);
    assert.ok(memory.reads.includes("/proj/lib.sh"), `${memory.reads}`);
  });

  test("lints the same script without an rc as ShellCheck would", async () => {
    assert.deepStrictEqual(await lintDocument("/bare/script.sh"), [
      ["SC1091", 2],
      ["SC2034", 3],
      ["SC2154", 4],
      ["SC2086", 4],
    ]);
  });
});
