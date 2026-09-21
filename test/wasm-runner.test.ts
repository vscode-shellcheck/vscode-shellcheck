import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { Worker } from "node:worker_threads";
import {
  LintRequest,
  RunSupersededError,
  RunnerDisposedError,
  WasmRuntimeError,
} from "../src/runtime/types.js";
import type {
  MainToWorker,
  WorkerToMain,
} from "../src/runtime/wasm/protocol.js";
import {
  WasmModuleSource,
  WasmRunner,
  loadPackagedModule,
} from "../src/runtime/wasm/wasm-runner.js";
import { Arguments, Logger } from "../src/utils/logging/types.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const fixtureRoot = path.join(repoRoot, "test", "fixtures", "wasm-parity");
const workerPath = path.join(repoRoot, "dist", "wasm-worker.js");
// -x makes the sourced file reachable only through the preopen.
const shellCheckArgs = ["-x", "-f", "json1", "-s", "bash", "-"];

const fixtureScript = fs.readFileSync(
  path.join(fixtureRoot, "src", "sources.sh"),
  "utf8",
);
/** Long enough that the watchdog and a supersede always win the race. */
const slowScript = `#!/bin/bash\n${"foo=$(ls); echo $foo\n".repeat(3000)}`;

class RecordingLogger implements Logger {
  public readonly lines: string[] = [];
  private readonly waiters: {
    pattern: RegExp;
    count: number;
    resolve: () => void;
  }[] = [];

  public trace(format: string, ...data: Arguments): void {
    this.record(format, data);
  }

  public debug(format: string, ...data: Arguments): void {
    this.record(format, data);
  }

  public info(format: string, ...data: Arguments): void {
    this.record(format, data);
  }

  public warn(format: string, ...data: Arguments): void {
    this.record(format, data);
  }

  public error(format: string, ...data: Arguments): void {
    this.record(format, data);
  }

  public matching(pattern: RegExp): string[] {
    return this.lines.filter((line) => pattern.test(line));
  }

  /** Resolves once `count` lines have matched, including earlier ones. */
  public wait(pattern: RegExp, count = 1): Promise<void> {
    if (this.matching(pattern).length >= count) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) =>
      this.waiters.push({ pattern, count, resolve }),
    );
  }

  private record(format: string, data: Arguments): void {
    const line = util.format(format, ...data);
    this.lines.push(line);
    for (const waiter of this.waiters.splice(0)) {
      if (this.matching(waiter.pattern).length >= waiter.count) {
        waiter.resolve();
      } else {
        this.waiters.push(waiter);
      }
    }
  }
}

function nativeOutput(): { stdout: string; status: number | null } {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const binary = path.join(
    repoRoot,
    "binaries",
    process.platform,
    process.arch,
    `shellcheck${suffix}`,
  );
  assert.ok(fs.existsSync(binary), `bundled shellcheck missing at ${binary}`);
  const native = spawnSync(binary, shellCheckArgs, {
    cwd: path.join(fixtureRoot, "src"),
    input: fixtureScript,
    encoding: "utf8",
  });
  assert.strictEqual(native.error, undefined);
  return { stdout: native.stdout, status: native.status };
}

function lintRequest(overrides: Partial<LintRequest> = {}): LintRequest {
  return {
    documentKey: "file:///fixture/src/sources.sh",
    executablePath: "shellcheck",
    args: shellCheckArgs,
    stdin: fixtureScript,
    cwd: path.join(fixtureRoot, "src"),
    preopenRoot: fixtureRoot,
    ...overrides,
  };
}

function workerThreadIds(logger: RecordingLogger): number[] {
  return logger
    .matching(/worker \d+ started/)
    .map((line) => Number(/worker (\d+) started/.exec(line)?.[1]));
}

suite("WASM Runner", function () {
  // Compiling the 9.9 MiB module and terminating deliberately slow runs are
  // both well past the default mocha budget.
  this.timeout(180000);

  let source: WasmModuleSource;
  const started: WasmRunner[] = [];

  suiteSetup(async () => {
    assert.ok(
      fs.existsSync(workerPath),
      `${workerPath} is missing; run "npm run build" first`,
    );
    source = await loadPackagedModule();
  });

  teardown(() => {
    started.splice(0).forEach((runner) => runner.dispose());
  });

  function createRunner(runTimeoutMs?: number): {
    runner: WasmRunner;
    logger: RecordingLogger;
    loads: () => number;
  } {
    const logger = new RecordingLogger();
    let loads = 0;
    const runner = new WasmRunner({
      workerPath,
      logger,
      runTimeoutMs,
      loadModule: () => {
        loads++;
        return Promise.resolve(source);
      },
    });
    started.push(runner);
    return { runner, logger, loads: () => loads };
  }

  test("matches the native binary byte for byte", async () => {
    const { runner } = createRunner();
    const native = nativeOutput();
    const result = await runner.run(lintRequest());

    assert.strictEqual(result.stdout, native.stdout);
    assert.strictEqual(native.status, 1);
    // Findings are a normal outcome, not a failure.
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stderr, "");
  });

  test("keeps only the newest queued request per document", async () => {
    const { runner, logger } = createRunner();
    const stale = runner.run(lintRequest({ stdin: slowScript }));
    const alsoStale = runner.run(lintRequest({ stdin: slowScript }));
    const newest = runner.run(lintRequest());

    await assert.rejects(stale, RunSupersededError);
    await assert.rejects(alsoStale, RunSupersededError);
    assert.strictEqual((await newest).stdout, nativeOutput().stdout);
    // Nothing was in flight, so nothing had to be terminated.
    assert.deepStrictEqual(logger.matching(/terminated/), []);
  });

  test("queues a request for another document instead of cancelling", async () => {
    const { runner, logger } = createRunner();
    const first = runner.run(lintRequest({ documentKey: "file:///a.sh" }));
    const second = runner.run(lintRequest({ documentKey: "file:///b.sh" }));
    const expected = nativeOutput().stdout;

    assert.strictEqual((await first).stdout, expected);
    assert.strictEqual((await second).stdout, expected);
    assert.deepStrictEqual(logger.matching(/terminated/), []);
    assert.strictEqual(workerThreadIds(logger).length, 1);
  });

  test("supersedes an in-flight run for the same document", async () => {
    const { runner, logger } = createRunner();
    const superseded = runner.run(lintRequest({ stdin: slowScript }));
    await logger.wait(/run 1 started/);

    const newest = runner.run(lintRequest());
    await assert.rejects(superseded, RunSupersededError);
    assert.strictEqual((await newest).stdout, nativeOutput().stdout);

    const threadIds = workerThreadIds(logger);
    assert.strictEqual(threadIds.length, 2, logger.lines.join("\n"));
    assert.notStrictEqual(threadIds[0], threadIds[1]);
    assert.strictEqual(logger.matching(/terminated/).length, 1);
  });

  test("posts the retained module again instead of recompiling on respawn", async () => {
    // A budget no run can meet, so the very first lint forces a respawn.
    const { runner, logger, loads } = createRunner(1);
    await assert.rejects(runner.run(lintRequest()), WasmRuntimeError);
    await logger.wait(/ready \(module source: /, 2);

    assert.strictEqual(loads(), 1, "the module was loaded more than once");
    const ready = logger.matching(/ready \(module source: /);
    ready.forEach((line) => assert.match(line, /module source: module/));
    // Structured clone must leave the main thread's copy intact.
    assert.ok(WebAssembly.Module.imports(source.module).length > 0);
  });

  test("terminates a run that exceeds its watchdog budget", async () => {
    const baselineRunner = createRunner();
    const startedAt = Date.now();
    await baselineRunner.runner.run(lintRequest());
    const baselineMs = Date.now() - startedAt;
    baselineRunner.runner.dispose();

    const budget = Math.max(1000, baselineMs * 4);
    const { runner, logger } = createRunner(budget);
    await assert.rejects(
      runner.run(lintRequest({ stdin: slowScript })),
      (error: unknown) =>
        error instanceof WasmRuntimeError &&
        /timed out after \d+ ms/.test(error.message),
    );
    assert.strictEqual(logger.matching(/exceeded \d+ ms/).length, 1);

    // The respawned worker serves the next request.
    assert.strictEqual(
      (await runner.run(lintRequest())).stdout,
      nativeOutput().stdout,
    );
    assert.strictEqual(workerThreadIds(logger).length, 2);
  });

  test("rejects when the guest cannot enter the working directory", async () => {
    await assert.rejects(
      createRunner().runner.run(
        lintRequest({ cwd: path.join(fixtureRoot, "no-such-dir") }),
      ),
      (error: unknown) =>
        error instanceof WasmRuntimeError &&
        error.detail.includes("hs_init_ghc"),
    );
  });

  test("rejects only the run whose preopen root does not exist", async () => {
    const { runner } = createRunner();
    const missingRoot = path.join(repoRoot, "no-such-workspace-root");
    await assert.rejects(
      runner.run(
        lintRequest({
          cwd: path.join(missingRoot, "sub"),
          preopenRoot: missingRoot,
        }),
      ),
      (error: unknown) =>
        error instanceof WasmRuntimeError && error.detail.includes("ENOENT"),
    );
    // The worker survives it: the next run on the same runner is unaffected.
    assert.strictEqual(
      (await runner.run(lintRequest())).stdout,
      nativeOutput().stdout,
    );
  });

  test("resolves and logs when shellcheck rejects an argument", async () => {
    const { runner, logger } = createRunner();
    const result = await runner.run(
      lintRequest({ args: ["--no-such-flag", ...shellCheckArgs] }),
    );

    assert.strictEqual(result.exitCode, 3);
    assert.strictEqual(result.stdout, "");
    assert.match(result.stderr, /unrecognized option/);
    assert.strictEqual(logger.matching(/exited with 3/).length, 1);
  });

  test("rejects in-flight and queued runs when disposed", async () => {
    const { runner, logger } = createRunner();
    const inFlight = runner.run(
      lintRequest({ documentKey: "file:///a.sh", stdin: slowScript }),
    );
    await logger.wait(/run 1 started/);
    const queued = runner.run(lintRequest({ documentKey: "file:///b.sh" }));

    runner.dispose();
    await assert.rejects(inFlight, RunnerDisposedError);
    await assert.rejects(queued, RunnerDisposedError);
    await assert.rejects(runner.run(lintRequest()), RunnerDisposedError);

    // Resolves only once the worker thread is really gone.
    await logger.wait(/worker \d+ terminated/);
    runner.dispose();
  });
});

suite("WASM Worker Protocol", function () {
  this.timeout(180000);

  const workers: Worker[] = [];
  let source: WasmModuleSource;

  suiteSetup(async () => {
    source = await loadPackagedModule();
  });

  teardown(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.terminate()));
  });

  function spawn(): Worker {
    const worker = new Worker(workerPath);
    workers.push(worker);
    return worker;
  }

  function send(worker: Worker, message: MainToWorker): Promise<WorkerToMain> {
    return new Promise<WorkerToMain>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage(message);
    });
  }

  function lint(worker: Worker, id: number): Promise<WorkerToMain> {
    return send(worker, {
      type: "run",
      id,
      args: shellCheckArgs,
      env: { PWD: "/src" },
      stdin: new TextEncoder().encode(fixtureScript),
      preopen: { guestName: "/", hostRoot: fixtureRoot },
    });
  }

  test("runs on a transferred module and leaves the original usable", async () => {
    const expected = nativeOutput().stdout;

    const first = spawn();
    assert.deepStrictEqual(
      await send(first, {
        type: "init",
        source: "module",
        module: source.module,
      }),
      { type: "ready", moduleSource: "module" },
    );
    assert.deepStrictEqual(await lint(first, 1), {
      type: "result",
      id: 1,
      exitCode: 1,
      stdout: expected,
      stderr: "",
    });
    await first.terminate();

    // The same Module object again: a respawn never goes back to the bytes.
    const second = spawn();
    assert.deepStrictEqual(
      await send(second, {
        type: "init",
        source: "module",
        module: source.module,
      }),
      { type: "ready", moduleSource: "module" },
    );
    assert.deepStrictEqual(await lint(second, 2), {
      type: "result",
      id: 2,
      exitCode: 1,
      stdout: expected,
      stderr: "",
    });
    assert.ok(WebAssembly.Module.imports(source.module).length > 0);
  });

  test("compiles from bytes when a module cannot be transferred", async () => {
    const worker = spawn();
    assert.deepStrictEqual(
      await send(worker, {
        type: "init",
        source: "bytes",
        bytes: await source.readBytes(),
      }),
      { type: "ready", moduleSource: "bytes" },
    );
    assert.deepStrictEqual(await lint(worker, 7), {
      type: "result",
      id: 7,
      exitCode: 1,
      stdout: nativeOutput().stdout,
      stderr: "",
    });
  });

  test("reports a run that arrives before its module", async () => {
    const reply = await lint(spawn(), 3);
    assert.strictEqual(reply.type, "failed");
    assert.strictEqual(reply.type === "failed" ? reply.id : undefined, 3);
  });
});

suite("WASM Bundles", () => {
  test("the worker imports the wasm package instead of inlining it", () => {
    const worker = fs.readFileSync(workerPath, "utf8");
    assert.match(
      worker,
      /from\s*"@vscode-shellcheck\/shellcheck-wasm\/node"/,
      `${workerPath} does not import the wasm package`,
    );
    assert.doesNotMatch(
      worker,
      /wasi_snapshot_preview1/,
      `${workerPath} bundles the wasm package`,
    );
  });

  test("the extension bundle carries none of the wasm package", () => {
    const extension = fs.readFileSync(
      path.join(repoRoot, "dist", "extension.js"),
      "utf8",
    );
    assert.doesNotMatch(extension, /wasi_snapshot_preview1/);
    assert.doesNotMatch(extension, /browser_wasi_shim/);
    // Only a dynamic import of the package may name it; its code must not
    // be there, and the static hoist esbuild would give a top-level import
    // would load it in every native session.
    assert.doesNotMatch(
      extension,
      /import\s*\{[^}]*\}\s*from\s*"@vscode-shellcheck/,
    );
  });
});
