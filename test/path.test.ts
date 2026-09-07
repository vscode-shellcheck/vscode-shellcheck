import assert from "node:assert";
import os from "node:os";
import { fixDriveCasingInWindows, substitutePath } from "../src/utils/path.js";

suite("Path Utils", () => {
  test("substitutePath should resolve variables correctly", () => {
    const userHome = fixDriveCasingInWindows(os.homedir());
    const workspaceFolder = "/path/to/my-project";

    assert.strictEqual(
      substitutePath("${" + "userHome}/.local/bin/shellcheck", workspaceFolder),
      `${userHome}/.local/bin/shellcheck`,
    );

    assert.strictEqual(
      substitutePath("${" + "workspaceFolder}/bin/shellcheck", workspaceFolder),
      "/path/to/my-project/bin/shellcheck",
    );

    assert.strictEqual(
      substitutePath("${" + "workspaceRoot}/bin/shellcheck", workspaceFolder),
      "/path/to/my-project/bin/shellcheck",
    );
  });
});
