import * as assert from "node:assert";
import { parseToolVersion } from "../src/utils/tool-check";

suite("Tool Check Utils", () => {
  test("parseToolVersion should work", async () => {
    const stdout = `ShellCheck - shell script analysis tool
version: 0.9.0
license: GNU General Public License, version 3
website: https://www.shellcheck.net
`;

    const version = parseToolVersion(stdout);
    assert.strictEqual(version.format(), "0.9.0");
  });

  test("parseToolVersion should throw on invalid input", async () => {
    const stdout = `ShellCheck - shell script analysis tool
version: 0.8.a
`;

    assert.throws(
      () => parseToolVersion(stdout),
      "Unexpected response from ShellCheck",
    );
  });
});
