import assert from "node:assert";
import * as vscode from "vscode";
import {
  fromGuestPath,
  hasHostAbsolutePath,
  planDocumentMount,
  toGuestPath,
} from "../src/runtime/wasm/guest-path.js";

const uri = (value: string) => vscode.Uri.parse(value);

function plan(
  document: string,
  folder: string | undefined,
  useWorkspaceRootAsCwd = false,
): { root: string; pwd: string } | undefined {
  const mount = planDocumentMount(
    uri(document),
    folder === undefined ? undefined : uri(folder),
    useWorkspaceRootAsCwd,
  );
  return mount && { root: mount.root.toString(), pwd: mount.pwd };
}

suite("WASM Guest Paths", () => {
  test("toGuestPath names a Uri relative to the mount", () => {
    const root = uri("vscode-vfs://github/o/r");
    assert.strictEqual(toGuestPath(root, root), "/");
    assert.strictEqual(toGuestPath(root, uri("vscode-vfs://github/o/r/")), "/");
    assert.strictEqual(
      toGuestPath(root, uri("vscode-vfs://github/o/r/sub/main.sh")),
      "/sub/main.sh",
    );
    assert.strictEqual(toGuestPath(uri("mem:/"), uri("mem:/a/b")), "/a/b");
  });

  test("toGuestPath absorbs a drive letter into the mount", () => {
    // What Uri.file("C:\\proj") is on Windows. VS Code reports the drive
    // letter in either case, and matches workspace folders regardless.
    const root = uri("file:///c:/proj");
    assert.strictEqual(toGuestPath(root, uri("file:///c:/proj/sub")), "/sub");
    assert.strictEqual(toGuestPath(root, uri("file:///C:/proj/sub")), "/sub");
  });

  test("toGuestPath rejects Uris outside the mount", () => {
    const root = uri("mem:/proj");
    assert.strictEqual(toGuestPath(root, uri("mem:/etc/shadow")), undefined);
    // A sibling sharing the root's prefix is not inside it.
    assert.strictEqual(toGuestPath(root, uri("mem:/projector")), undefined);
    assert.strictEqual(toGuestPath(root, uri("other:/proj/a")), undefined);
    assert.strictEqual(toGuestPath(root, uri("mem://host/proj/a")), undefined);
  });

  test("toGuestPath accepts a directory whose name starts with a dot dot", () => {
    assert.strictEqual(
      toGuestPath(uri("mem:/proj"), uri("mem:/proj/..hidden")),
      "/..hidden",
    );
  });

  test("fromGuestPath maps guest paths back below the mount", () => {
    const root = uri("vscode-vfs://github/o/r");
    assert.strictEqual(fromGuestPath(root, "/")?.toString(), root.toString());
    assert.strictEqual(
      fromGuestPath(root, "/sub/./.shellcheckrc")?.toString(),
      "vscode-vfs://github/o/r/sub/.shellcheckrc",
    );
  });

  test("fromGuestPath refuses a guest path that climbs out", () => {
    const root = uri("mem:/proj");
    assert.strictEqual(fromGuestPath(root, "/../etc/shadow"), undefined);
    assert.strictEqual(fromGuestPath(root, "/sub/../../etc"), undefined);
  });

  test("a document in a workspace folder mounts the folder", () => {
    assert.deepStrictEqual(plan("mem:/proj/sub/a.sh", "mem:/proj"), {
      root: "mem:/proj",
      pwd: "/sub",
    });
    assert.deepStrictEqual(plan("mem:/proj/a.sh", "mem:/proj"), {
      root: "mem:/proj",
      pwd: "/",
    });
  });

  test("useWorkspaceRootAsCwd runs in the folder root", () => {
    assert.deepStrictEqual(plan("mem:/proj/sub/a.sh", "mem:/proj", true), {
      root: "mem:/proj",
      pwd: "/",
    });
  });

  test("a document outside every folder mounts its own directory", () => {
    assert.deepStrictEqual(plan("mem:/elsewhere/sub/a.sh", undefined), {
      root: "mem:/elsewhere/sub",
      pwd: "/",
    });
    assert.deepStrictEqual(plan("mem:/elsewhere/sub/a.sh", undefined, true), {
      root: "mem:/elsewhere/sub",
      pwd: "/",
    });
  });

  test("a folder that does not contain the document is not mounted", () => {
    // A PWD outside the mount would silently empty the output.
    assert.deepStrictEqual(plan("mem:/elsewhere/a.sh", "mem:/proj"), {
      root: "mem:/elsewhere",
      pwd: "/",
    });
  });

  test("an untitled document gets no files", () => {
    assert.strictEqual(plan("untitled:Untitled-1", undefined), undefined);
    assert.strictEqual(plan("untitled:/proj/a.sh", "mem:/proj"), undefined);
  });

  test("hasHostAbsolutePath spots host paths of either platform", () => {
    for (const arg of [
      "/abs/path",
      "--source-path=/abs",
      "-P=C:\\proj",
      "C:/proj",
      "\\\\server\\share",
    ]) {
      assert.ok(hasHostAbsolutePath(arg), arg);
    }
    for (const arg of ["-x", "--source-path=SCRIPTDIR", "lib", "-e", ""]) {
      assert.ok(!hasHostAbsolutePath(arg), arg);
    }
  });
});
