import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as vscode from "vscode";
import {
  createWorkspaceFileSystem,
  ReadableFileSystem,
  resolveDocumentMount,
} from "../src/runtime/wasm/workspace-fs.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const fixtureRoot = path.join(repoRoot, "test", "fixtures", "wasm-parity");
const root = vscode.Uri.parse("mem:/proj");

/** Serves every Uri with one canned answer, and records what was asked. */
function cannedFileSystem(answer: {
  type?: vscode.FileType;
  error?: unknown;
}): ReadableFileSystem & { asked: string[] } {
  const asked: string[] = [];
  const respond = <T>(uri: vscode.Uri, value: T): Promise<T> => {
    asked.push(uri.toString());
    return answer.error === undefined
      ? Promise.resolve(value)
      : Promise.reject(answer.error);
  };
  const type = answer.type ?? vscode.FileType.File;
  return {
    asked,
    stat: (uri) => respond(uri, { type, ctime: 1, mtime: 2, size: 3 }),
    readFile: (uri) => respond(uri, new TextEncoder().encode(uri.path)),
    readDirectory: (uri) => respond(uri, [["entry", type]]),
  };
}

suite("WASM Workspace File System", () => {
  test("serves guest paths below the mount root", async () => {
    const fs = cannedFileSystem({});
    const guest = createWorkspaceFileSystem(root, fs);

    assert.deepStrictEqual(await guest.stat("/"), {
      type: "file",
      size: 3,
      mtime: 2,
    });
    assert.strictEqual(
      new TextDecoder().decode(await guest.readFile("/sub/.shellcheckrc")),
      "/proj/sub/.shellcheckrc",
    );
    assert.deepStrictEqual(await guest.readDirectory("/sub"), [
      ["entry", "file"],
    ]);
    assert.deepStrictEqual(fs.asked, [
      "mem:/proj",
      "mem:/proj/sub/.shellcheckrc",
      "mem:/proj/sub",
    ]);
  });

  test("maps file types, ignoring the symbolic link flag", async () => {
    const cases: [vscode.FileType, string][] = [
      [vscode.FileType.File, "file"],
      [vscode.FileType.Directory, "directory"],
      [vscode.FileType.Unknown, "other"],
      [vscode.FileType.File | vscode.FileType.SymbolicLink, "file"],
      [vscode.FileType.Directory | vscode.FileType.SymbolicLink, "directory"],
      // A dangling link.
      [vscode.FileType.SymbolicLink, "other"],
    ];
    for (const [type, expected] of cases) {
      const guest = createWorkspaceFileSystem(root, cannedFileSystem({ type }));
      assert.strictEqual((await guest.stat("/a")).type, expected, `${type}`);
      assert.deepStrictEqual(await guest.readDirectory("/"), [
        ["entry", expected],
      ]);
    }
  });

  test("reports file system errors under the codes the package knows", async () => {
    const cases: [vscode.FileSystemError, string][] = [
      [vscode.FileSystemError.FileNotFound(), "FileNotFound"],
      [vscode.FileSystemError.FileNotADirectory(), "FileNotADirectory"],
      [vscode.FileSystemError.FileIsADirectory(), "FileIsADirectory"],
      [vscode.FileSystemError.NoPermissions(), "NoPermissions"],
      [vscode.FileSystemError.Unavailable(), "Unavailable"],
    ];
    for (const [error, code] of cases) {
      const guest = createWorkspaceFileSystem(
        root,
        cannedFileSystem({ error }),
      );
      for (const call of [
        () => guest.stat("/a"),
        () => guest.readFile("/a"),
        () => guest.readDirectory("/a"),
      ]) {
        await assert.rejects(call(), (thrown: unknown) => {
          assert.strictEqual((thrown as { code?: unknown }).code, code);
          return true;
        });
      }
    }
  });

  test("rethrows any other failure as it is", async () => {
    for (const error of [
      vscode.FileSystemError.FileExists(),
      new Error("provider bug"),
    ]) {
      const guest = createWorkspaceFileSystem(
        root,
        cannedFileSystem({ error }),
      );
      await assert.rejects(guest.readFile("/a"), (thrown) => thrown === error);
    }
  });

  test("mounts the directory of a document outside every folder", async () => {
    // This suite runs with no workspace folder open.
    const document = vscode.Uri.file(
      path.join(fixtureRoot, "src", "sources.sh"),
    );
    const mount = await resolveDocumentMount(document, false);
    assert.ok(mount);
    assert.strictEqual(mount.pwd, "/");
    assert.strictEqual((await mount.fs.stat("/sources.sh")).type, "file");
    // ../lib exists on disk, but not in the mount.
    await assert.rejects(mount.fs.stat("/../lib"), (thrown: unknown) => {
      assert.strictEqual((thrown as { code?: unknown }).code, "FileNotFound");
      return true;
    });
  });

  test("gives no files to a document whose directory cannot be read", async () => {
    const unreadable = cannedFileSystem({
      error: vscode.FileSystemError.Unavailable(),
    });
    assert.strictEqual(
      await resolveDocumentMount(
        vscode.Uri.parse("mem:/proj/a.sh"),
        false,
        unreadable,
      ),
      undefined,
    );
    assert.deepStrictEqual(unreadable.asked, ["mem:/proj"]);

    const notADirectory = cannedFileSystem({ type: vscode.FileType.File });
    assert.strictEqual(
      await resolveDocumentMount(
        vscode.Uri.parse("mem:/proj/a.sh"),
        false,
        notADirectory,
      ),
      undefined,
    );
  });

  test("gives no files to an untitled document", async () => {
    const fs = cannedFileSystem({ type: vscode.FileType.Directory });
    assert.strictEqual(
      await resolveDocumentMount(
        vscode.Uri.parse("untitled:Untitled-1"),
        false,
        fs,
      ),
      undefined,
    );
    assert.deepStrictEqual(fs.asked, []);
  });
});
