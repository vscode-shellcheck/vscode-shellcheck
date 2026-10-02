import assert from "node:assert";
import * as vscode from "vscode";
import {
  ConfigFileChange,
  isAffected,
  parseRcArgs,
} from "../src/config-files.js";

const script = vscode.Uri.file("/repo/src/deep/script.sh");

function affects(
  change: ConfigFileChange,
  options: {
    args?: string[];
    runtime?: "native" | "wasm";
    rcfile?: string;
  } = {},
): boolean {
  return isAffected(change, {
    uri: script,
    runtime: options.runtime ?? "native",
    rcArgs: parseRcArgs(options.args ?? []),
    rcfile: options.rcfile ? vscode.Uri.file(options.rcfile) : undefined,
  });
}

suite("Config files", () => {
  suite("parseRcArgs", () => {
    test("no rc arguments", () => {
      assert.deepStrictEqual(parseRcArgs(["-x", "-e", "SC2034"]), {
        norc: false,
        rcfile: undefined,
      });
    });

    test("--norc", () => {
      assert.strictEqual(parseRcArgs(["-x", "--norc"]).norc, true);
    });

    test("--rcfile as two arguments", () => {
      assert.strictEqual(
        parseRcArgs(["--rcfile", "conf/rc", "-x"]).rcfile,
        "conf/rc",
      );
    });

    test("--rcfile=", () => {
      assert.strictEqual(parseRcArgs(["--rcfile=conf/rc"]).rcfile, "conf/rc");
    });

    test("the last --rcfile wins", () => {
      assert.strictEqual(
        parseRcArgs(["--rcfile=a", "--rcfile", "b"]).rcfile,
        "b",
      );
    });

    test("a trailing --rcfile without a value is ignored", () => {
      assert.strictEqual(parseRcArgs(["--rcfile"]).rcfile, undefined);
    });
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
      assert.ok(!affects(inFolder("/repo"), { args: ["--norc"] }));
      assert.ok(!affects(userLevel, { args: ["--norc"] }));
      assert.ok(
        !affects(
          { kind: "rcfile", file: vscode.Uri.file("/conf/rc") },
          { args: ["--norc", "--rcfile", "/conf/rc"], rcfile: "/conf/rc" },
        ),
      );
    });

    test("--rcfile ignores the search and follows its own file", () => {
      const options = { args: ["--rcfile", "/conf/rc"], rcfile: "/conf/rc" };
      assert.ok(!affects(inFolder("/repo"), options));
      assert.ok(!affects(userLevel, options));
      assert.ok(
        affects({ kind: "rcfile", file: vscode.Uri.file("/conf/rc") }, options),
      );
      assert.ok(
        !affects(
          { kind: "rcfile", file: vscode.Uri.file("/conf/other") },
          options,
        ),
      );
    });

    test("an --rcfile change does not reach documents without one", () => {
      assert.ok(
        !affects({ kind: "rcfile", file: vscode.Uri.file("/conf/rc") }),
      );
    });
  });
});
