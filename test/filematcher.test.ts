import assert from "node:assert";
import { FileMatcher } from "../src/utils/filematcher.js";

suite("FileMatcher", () => {
  test("excludes a path that matches an enabled pattern, relative to the workspace folder", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/*.zsh": true });

    assert.strictEqual(matcher.excludes("/ws/src/script.zsh", "/ws"), true);
    assert.strictEqual(matcher.excludes("/ws/src/script.sh", "/ws"), false);
  });

  test("ignores patterns set to false", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/*.zsh": true, "**/*.sh": false });

    assert.strictEqual(matcher.excludes("/ws/script.zsh", "/ws"), true);
    assert.strictEqual(matcher.excludes("/ws/script.sh", "/ws"), false);
  });

  test("matches a file outside the workspace by its absolute path", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/tmp/*.sh": true });

    assert.strictEqual(matcher.excludes("/tmp/script.sh"), true);
    assert.strictEqual(matcher.excludes("/home/script.sh"), false);
  });

  test("wildcards match dot files", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/*.sh": true });

    assert.strictEqual(matcher.excludes("/ws/.hidden.sh", "/ws"), true);
  });

  test("extglob !(*.*) matches files without an extension, but not dot files", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/!(*.*)": true });

    assert.strictEqual(matcher.excludes("/ws/Makefile", "/ws"), true);
    assert.strictEqual(matcher.excludes("/ws/script.sh", "/ws"), false);
    assert.strictEqual(matcher.excludes("/ws/.bashrc", "/ws"), false);
  });

  test("backslash paths match the same patterns as forward-slash paths", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/*.zsh": true, "**/folder/**/*.sh": true });

    assert.strictEqual(
      matcher.excludes("C:\\proj\\src\\script.zsh", "C:\\proj"),
      true,
    );
    assert.strictEqual(
      matcher.excludes("C:\\proj\\src\\script.sh", "C:\\proj"),
      false,
    );
    assert.strictEqual(
      matcher.excludes("C:\\proj\\folder\\nested\\hook.sh", "C:\\proj"),
      true,
    );
  });

  test("an empty path is excluded", () => {
    const matcher = new FileMatcher();
    matcher.configure({});

    assert.strictEqual(matcher.excludes(""), true);
  });

  test("no enabled patterns excludes nothing", () => {
    const matcher = new FileMatcher();
    matcher.configure({});

    assert.strictEqual(matcher.excludes("/ws/script.sh", "/ws"), false);
  });

  test("configure replaces the previous patterns", () => {
    const matcher = new FileMatcher();
    matcher.configure({ "**/*.zsh": true });
    assert.strictEqual(matcher.excludes("/ws/script.zsh", "/ws"), true);

    matcher.configure({ "**/*.fish": true });
    assert.strictEqual(matcher.excludes("/ws/script.zsh", "/ws"), false);
    assert.strictEqual(matcher.excludes("/ws/script.fish", "/ws"), true);
  });
});
