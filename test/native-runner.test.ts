import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NativeRunner } from "../src/runtime/native-runner.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const binary = path.join(
  repoRoot,
  "binaries",
  process.platform,
  process.arch,
  `shellcheck${process.platform === "win32" ? ".exe" : ""}`,
);

suite("Native Runner", () => {
  test("reports the exit code and stderr of a rejected argument", async () => {
    const result = await new NativeRunner().run({
      documentKey: "untitled:native-runner",
      executablePath: binary,
      args: ["--no-such-flag", "-f", "json1", "-"],
      stdin: "#!/bin/bash\nx=1\n",
      cwd: undefined,
    });

    assert.strictEqual(result.stdout, "");
    assert.strictEqual(result.exitCode, 3);
    assert.match(result.stderr, /unrecognized option/);
  });

  test("reports exit code 1 for findings", async () => {
    const result = await new NativeRunner().run({
      documentKey: "untitled:native-runner",
      executablePath: binary,
      args: ["-f", "json1", "-"],
      stdin: "#!/bin/bash\nx=1\n",
      cwd: undefined,
    });

    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stdout, /"code":2034/);
  });
});
