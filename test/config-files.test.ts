import assert from "node:assert";
import * as vscode from "vscode";
import {
  ConfigFileChange,
  isAffected,
  parseRcArgs,
  RcArgs,
} from "../src/config-files.js";

const script = vscode.Uri.file("/repo/src/deep/script.sh");

function affects(
  change: ConfigFileChange,
  options: { args?: string[]; runtime?: "native" | "wasm" } = {},
): boolean {
  return isAffected(change, {
    uri: script,
    runtime: options.runtime ?? "native",
    rcArgs: parseRcArgs(options.args ?? []),
  });
}

suite("Config files", () => {
  test("parseRcArgs", () => {
    const cases: [string[], RcArgs][] = [
      [["-x", "-e", "SC2034"], { norc: false, rcfile: undefined }],
      [["-x", "--norc"], { norc: true, rcfile: undefined }],
      [["--rcfile", "conf/rc", "-x"], { norc: false, rcfile: "conf/rc" }],
      [["--rcfile=conf/rc"], { norc: false, rcfile: "conf/rc" }],
      [["--rcfile=a", "--rcfile", "b"], { norc: false, rcfile: "b" }],
      [["--rcfile"], { norc: false, rcfile: undefined }],
    ];
    for (const [args, expected] of cases) {
      assert.deepStrictEqual(parseRcArgs(args), expected, args.join(" "));
    }
  });

  suite("isAffected", () => {
    const inFolder = (path: string, nativeOnly = false): ConfigFileChange => ({
      kind: "search",
      folder: vscode.Uri.file(path),
      nativeOnly,
    });
    const userLevel: ConfigFileChange = {
      kind: "search",
      folder: undefined,
      nativeOnly: true,
    };
    const rcfileOf = (...documents: vscode.Uri[]): ConfigFileChange => ({
      kind: "rcfile",
      documents: new Set(documents.map((uri) => uri.toString())),
    });

    test("an rc file in the document's folder or above", () => {
      assert.ok(affects(inFolder("/repo/src/deep")));
      assert.ok(affects(inFolder("/repo")));
    });

    test("an rc file in a sibling or deeper folder", () => {
      assert.ok(!affects(inFolder("/repo/lib")));
      assert.ok(!affects(inFolder("/repo/src/deep/deeper")));
      // A shared name prefix is not a parent folder.
      assert.ok(!affects(inFolder("/repo/sr")));
    });

    test("an rc file in another scheme", () => {
      assert.ok(
        !affects({
          kind: "search",
          folder: vscode.Uri.from({ scheme: "vscode-vfs", path: "/repo" }),
          nativeOnly: false,
        }),
      );
    });

    test("a user-level rc file affects every native document", () => {
      assert.ok(affects(userLevel));
      assert.ok(!affects(userLevel, { runtime: "wasm" }));
    });

    test("a native-only folder does not reach the wasm runtime", () => {
      assert.ok(affects(inFolder("/", true)));
      assert.ok(!affects(inFolder("/", true), { runtime: "wasm" }));
      assert.ok(affects(inFolder("/repo"), { runtime: "wasm" }));
    });

    test("--norc ignores every change", () => {
      const args = ["--norc", "--rcfile", "/conf/rc"];
      assert.ok(!affects(inFolder("/repo"), { args }));
      assert.ok(!affects(userLevel, { args }));
      assert.ok(!affects(rcfileOf(script), { args }));
    });

    test("--rcfile ignores the search and follows its own file", () => {
      const args = ["--rcfile", "/conf/rc"];
      assert.ok(!affects(inFolder("/repo"), { args }));
      assert.ok(!affects(userLevel, { args }));
      assert.ok(affects(rcfileOf(script), { args }));
      assert.ok(
        !affects(rcfileOf(vscode.Uri.file("/repo/other.sh")), { args }),
      );
    });
  });
});
