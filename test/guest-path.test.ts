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
