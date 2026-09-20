import assert from "node:assert";
import path from "node:path";
import {
  createGuestPathMapper,
  OutsidePreopenError,
} from "../src/runtime/wasm/guest-path.js";

// Both platforms are exercised everywhere: the win32 rules are the ones most
// likely to rot on a POSIX-only development machine.
const posix = createGuestPathMapper(path.posix, false);
const win32 = createGuestPathMapper(path.win32, true);

suite("WASM Guest Paths", () => {
  test("toGuest maps host paths to POSIX guest paths", () => {
    assert.strictEqual(posix.toGuest("/proj", "/proj"), "/");
    assert.strictEqual(posix.toGuest("/proj", "/proj/sub"), "/sub");
    assert.strictEqual(
      posix.toGuest("/proj", "/proj/sub/main.sh"),
      "/sub/main.sh",
    );

    // The worked Windows example of the plan: the drive letter is absorbed
    // into the preopen and the separator becomes "/".
    assert.strictEqual(win32.toGuest("C:\\proj", "C:\\proj"), "/");
    assert.strictEqual(win32.toGuest("C:\\proj", "C:\\proj\\sub"), "/sub");
    assert.strictEqual(
      win32.toGuest("C:\\proj", "C:\\proj\\sub\\main.sh"),
      "/sub/main.sh",
    );
  });

  test("toGuest rejects host paths outside the preopen root", () => {
    assert.throws(
      () => posix.toGuest("/proj", "/etc/shadow"),
      OutsidePreopenError,
    );
    assert.throws(
      () => posix.toGuest("/proj", "/proj/../etc/shadow"),
      OutsidePreopenError,
    );
    // A sibling sharing the root's prefix is not inside it.
    assert.throws(
      () => posix.toGuest("/proj", "/projector"),
      OutsidePreopenError,
    );
    assert.throws(
      () => win32.toGuest("C:\\proj", "D:\\other"),
      OutsidePreopenError,
    );
  });

  test("toGuest accepts a directory whose name starts with a dot dot", () => {
    assert.strictEqual(posix.toGuest("/proj", "/proj/..hidden"), "/..hidden");
  });

  test("fromGuest resolves guest paths inside the preopen root", () => {
    assert.strictEqual(posix.fromGuest("/proj", "/sub"), "/proj/sub");
    assert.strictEqual(
      posix.fromGuest("/proj", "sub/main.sh"),
      "/proj/sub/main.sh",
    );
    assert.strictEqual(posix.fromGuest("/proj", "/"), "/proj");
    // ShellCheck resolves relative source directives this way.
    assert.strictEqual(
      posix.fromGuest("/proj", "../lib/util.sh", "/proj/sub"),
      "/proj/lib/util.sh",
    );
    assert.strictEqual(
      win32.fromGuest("C:\\proj", "sub/main.sh"),
      "C:\\proj\\sub\\main.sh",
    );
  });

  test("fromGuest rejects escapes out of the preopen root", () => {
    assert.strictEqual(posix.fromGuest("/proj", "../etc/shadow"), undefined);
    assert.strictEqual(posix.fromGuest("/proj", "/../etc/shadow"), undefined);
    assert.strictEqual(
      posix.fromGuest("/proj", "sub/../../etc/shadow"),
      undefined,
    );
    assert.strictEqual(posix.fromGuest("/proj", "../lib", "/proj"), undefined);
    assert.strictEqual(win32.fromGuest("C:\\proj", "../etc"), undefined);
    assert.strictEqual(win32.fromGuest("C:\\proj", "D:other"), undefined);
  });

  test("fromGuest rejects a backslash in a guest path on win32", () => {
    // "\" is an ordinary filename character to the guest, but path.resolve
    // reads it as a separator on win32, so it must never reach it.
    assert.strictEqual(
      win32.fromGuest("C:\\proj", "sub\\..\\..\\etc"),
      undefined,
    );
    assert.strictEqual(win32.fromGuest("C:\\proj", "sub\\main.sh"), undefined);
    // On POSIX the same name is a legal file inside the root.
    assert.strictEqual(
      posix.fromGuest("/proj", "sub\\main.sh"),
      "/proj/sub\\main.sh",
    );
  });

  test("toGuest and fromGuest round-trip", () => {
    for (const hostPath of ["/proj", "/proj/sub", "/proj/sub/main.sh"]) {
      assert.strictEqual(
        posix.fromGuest("/proj", posix.toGuest("/proj", hostPath)),
        hostPath,
      );
    }
    for (const hostPath of [
      "C:\\proj",
      "C:\\proj\\sub",
      "C:\\proj\\sub\\main.sh",
    ]) {
      assert.strictEqual(
        win32.fromGuest("C:\\proj", win32.toGuest("C:\\proj", hostPath)),
        hostPath,
      );
    }
  });

  test("resolveMapping places PWD inside the preopen", () => {
    assert.deepStrictEqual(posix.resolveMapping("/proj", "/proj/sub"), {
      hostRoot: "/proj",
      pwd: "/sub",
    });
    assert.deepStrictEqual(posix.resolveMapping("/proj", "/proj"), {
      hostRoot: "/proj",
      pwd: "/",
    });
    assert.deepStrictEqual(win32.resolveMapping("c:\\proj", "C:\\proj\\sub"), {
      hostRoot: "C:\\proj",
      pwd: "/sub",
    });
  });

  test("resolveMapping re-roots the preopen when the cwd is outside it", () => {
    // Multi-root windows hand out the first workspace folder for a document
    // that belongs to none, which would otherwise yield an unreachable PWD.
    assert.deepStrictEqual(posix.resolveMapping("/proj", "/elsewhere/sub"), {
      hostRoot: "/elsewhere/sub",
      pwd: "/",
    });
    assert.deepStrictEqual(win32.resolveMapping("C:\\proj", "D:\\other"), {
      hostRoot: "D:\\other",
      pwd: "/",
    });
  });

  test("resolveMapping yields no preopen without a root or a cwd", () => {
    assert.strictEqual(posix.resolveMapping(undefined, "/proj/sub"), undefined);
    assert.strictEqual(posix.resolveMapping("/proj", undefined), undefined);
  });
});
