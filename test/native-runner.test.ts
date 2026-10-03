import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NativeRunner } from "../src/runtime/native-runner.js";
import {
  LintRequest,
  NativeRunTimeoutError,
  RunnerDisposedError,
  RunSupersededError,
} from "../src/runtime/types.js";
import { Semaphore } from "../src/utils/semaphore.js";

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
    const result = await new NativeRunner(new Semaphore(0)).run({
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
    const result = await new NativeRunner(new Semaphore(0)).run({
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

function request(
  executablePath: string,
  args: string[] = [],
  documentKey = "untitled:/native-runner",
): LintRequest {
  return {
    documentKey,
    executablePath,
    args,
    stdin: "",
    cwd: undefined,
  };
}

/** Echoes `text` once `seconds` have passed. */
function slowEcho(text: string, seconds = 0.2): LintRequest {
  return request(
    "sh",
    ["-c", `sleep ${seconds}; echo ${text}`],
    `untitled:/${text}`,
  );
}

suite("Native runner slots", function () {
  suiteSetup(function () {
    if (process.platform === "win32") {
      this.skip();
    }
  });

  test("a spawn failure frees its slot", async () => {
    const runner = new NativeRunner(new Semaphore(1));
    const failed = runner.run(request("/nonexistent/shellcheck"));
    const next = runner.run(slowEcho("next", 0));

    await assert.rejects(failed);
    assert.strictEqual((await next).stdout, "next\n");
  });

  test("limit 1: a run that times out frees its slot for the next run", async () => {
    const runner = new NativeRunner(new Semaphore(1));
    const hung = runner.run({
      ...request("sh", ["-c", "sleep 5"], "untitled:/hung"),
      timeoutMs: 300,
    });
    // Queued for longer than its own timeout, which only starts on admission.
    const next = runner.run({ ...slowEcho("next", 0), timeoutMs: 200 });

    await assert.rejects(hung, NativeRunTimeoutError);
    assert.strictEqual((await next).stdout, "next\n");
  });

  test("cancel drops a queued run and lets a running one finish", async () => {
    const runner = new NativeRunner(new Semaphore(1));
    const running = runner.run(slowEcho("running"));
    const queued = runner.run(slowEcho("queued"));

    runner.cancel("untitled:/running");
    runner.cancel("untitled:/queued");
    await assert.rejects(queued, RunSupersededError);
    assert.strictEqual((await running).stdout, "running\n");
  });

  test("dispose rejects queued runs and lets the running one finish", async () => {
    const limiter = new Semaphore(1);
    const runner = new NativeRunner(limiter);
    const running = runner.run(slowEcho("running"));
    const queued = runner.run(slowEcho("queued"));

    runner.dispose();
    await assert.rejects(queued, RunnerDisposedError);
    await assert.rejects(runner.run(slowEcho("late")), RunnerDisposedError);
    assert.strictEqual((await running).stdout, "running\n");

    // The slot the disposed runner held is free for the runner replacing it.
    const replacement = new NativeRunner(limiter);
    const next = await replacement.run(slowEcho("next", 0));
    assert.strictEqual(next.stdout, "next\n");
  });
});
