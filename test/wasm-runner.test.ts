import type {
  LintOptions,
  LintRequest as PackageLintRequest,
  LintResult as PackageLintResult,
  ShellCheck,
} from "@vscode-shellcheck/shellcheck-wasm/client";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import * as vscode from "vscode";
import {
  LintMount,
  LintRequest,
  LintResult,
  RunSupersededError,
  RunTimeoutError,
  RunnerDisposedError,
  WasmRuntimeError,
} from "../src/runtime/types.js";
import {
  compilePackagedModule,
  loadPackagedShellCheck,
} from "../src/runtime/wasm/packaged.js";
import { WasmRunner } from "../src/runtime/wasm/wasm-runner.js";
import { createWorkspaceFileSystem } from "../src/runtime/wasm/workspace-fs.js";
import { Arguments, Logger } from "../src/utils/logging/types.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const fixtureRoot = path.join(repoRoot, "test", "fixtures", "wasm-parity");
const workerPath = path.join(repoRoot, "dist", "wasm-worker.js");
const webExtensionPath = path.join(repoRoot, "dist", "web", "extension.cjs");
// -x makes the sourced file reachable only through the mount.
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

interface FakeLint {
  /** Which package instance it was handed to, counting from 1. */
  readonly instance: number;
  readonly request: PackageLintRequest;
  readonly signal: AbortSignal;
  resolve(result: PackageLintResult): void;
  reject(error: unknown): void;
}

/**
 * Stands in for the package: records what each of its instances is handed,
 * settles on demand.
 */
class FakePackage {
  public readonly lints: FakeLint[] = [];
  public instances = 0;
  /** Instances disposed, by number. */
  public readonly disposed: number[] = [];

  public create(): ShellCheck {
    const instance = ++this.instances;
    return {
      lint: (request, options) => this.lint(instance, request, options),
      dispose: () => {
        this.disposed.push(instance);
        return Promise.resolve();
      },
    };
  }

  private lint(
    instance: number,
    request: PackageLintRequest,
    options: LintOptions = {},
  ): Promise<PackageLintResult> {
    const signal = options.signal ?? new AbortController().signal;
    return new Promise<PackageLintResult>((resolve, reject) => {
      // The package rejects with the signal's reason, running or not.
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
      this.lints.push({ instance, request, signal, resolve, reject });
    });
  }

  /** The stdin of every lint submitted so far, in order. */
  public submitted(): unknown[] {
    return this.lints.map((lint) => lint.request.stdin);
  }

  public last(): FakeLint {
    return this.lints[this.lints.length - 1];
  }

  public lintOf(stdin: string): FakeLint {
    return this.lints.find((lint) => lint.request.stdin === stdin)!;
  }
}

const clean: PackageLintResult = { stdout: "", stderr: "", exitCode: 0 };

/** Lets the runner's promise callbacks run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function lintRequest(overrides: Partial<LintRequest> = {}): LintRequest {
  return {
    documentKey: "file:///fixture/src/sources.sh",
    executablePath: "shellcheck",
    args: shellCheckArgs,
    stdin: fixtureScript,
    cwd: undefined,
    ...overrides,
  };
}

function documentRequest(key: string, stdin = key): LintRequest {
  return lintRequest({ documentKey: `file:///${key}.sh`, stdin });
}

suite("WASM Runner scheduling", () => {
  let shellcheck: FakePackage;
  let logger: RecordingLogger;
  let activeDocumentKey: string | undefined;
  let maxConcurrentRuns: number;
  let runner: WasmRunner;

  /** Every run is observed: a dropped one rejects, and only some tests care. */
  function start(request: LintRequest): Promise<LintResult> {
    const run = runner.run(request);
    run.catch(() => undefined);
    return run;
  }

  setup(() => {
    shellcheck = new FakePackage();
    logger = new RecordingLogger();
    activeDocumentKey = undefined;
    // Most of the order below is only observable one lint at a time.
    maxConcurrentRuns = 1;
    runner = new WasmRunner({
      createShellCheck: () => shellcheck.create(),
      logger,
      activeDocumentKey: () => activeDocumentKey,
      maxConcurrentRuns: () => maxConcurrentRuns,
    });
  });

  teardown(() => {
    runner.dispose();
  });

  test("with a limit of 1, hands the package one lint at a time", async () => {
    const a = start(documentRequest("a"));
    const b = start(documentRequest("b"));
    assert.deepStrictEqual(shellcheck.submitted(), ["a"]);

    shellcheck.last().resolve(clean);
    await a;
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b"]);
    shellcheck.last().resolve(clean);
    await b;
  });

  test("0 runs two lints at once, each on an instance of its own", async () => {
    maxConcurrentRuns = 0;
    start(documentRequest("a"));
    start(documentRequest("b"));
    start(documentRequest("c"));
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b"]);
    assert.notStrictEqual(
      shellcheck.lintOf("a").instance,
      shellcheck.lintOf("b").instance,
    );

    // The next lint reuses the instance that came free.
    shellcheck.lintOf("b").resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b", "c"]);
    assert.strictEqual(
      shellcheck.lintOf("c").instance,
      shellcheck.lintOf("b").instance,
    );
    assert.strictEqual(shellcheck.instances, 2);
  });

  test("a raised limit starts waiting lints with the next request", () => {
    start(documentRequest("a"));
    start(documentRequest("b"));
    start(documentRequest("c"));
    maxConcurrentRuns = 3;
    start(documentRequest("d"));
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b", "c"]);
  });

  test("a lowered limit shuts down the instances it no longer needs", async () => {
    maxConcurrentRuns = 2;
    start(documentRequest("a"));
    start(documentRequest("b"));
    maxConcurrentRuns = 1;
    start(documentRequest("c"));

    shellcheck.lintOf("a").resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.disposed, [
      shellcheck.lintOf("a").instance,
    ]);
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b"]);

    shellcheck.lintOf("b").resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b", "c"]);
    assert.strictEqual(
      shellcheck.lintOf("c").instance,
      shellcheck.lintOf("b").instance,
    );
  });

  test("keeps only the newest pending request per document", async () => {
    start(documentRequest("a"));
    const stale = start(documentRequest("b", "b1"));
    const newest = start(documentRequest("b", "b2"));
    await assert.rejects(stale, RunSupersededError);

    shellcheck.last().resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b2"]);
    shellcheck.last().resolve(clean);
    await newest;
  });

  test("a replaced request keeps its place in line", async () => {
    start(documentRequest("a"));
    start(documentRequest("b", "b1"));
    start(documentRequest("c"));
    start(documentRequest("b", "b2"));

    for (let i = 0; i < 2; i++) {
      shellcheck.last().resolve(clean);
      await settled();
    }
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b2", "c"]);
  });

  test("the active editor's document goes first", async () => {
    start(documentRequest("a"));
    start(documentRequest("b"));
    start(documentRequest("c"));
    activeDocumentKey = "file:///c.sh";

    shellcheck.last().resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "c"]);

    // Once it has run, the rest is first in, first out again.
    shellcheck.last().resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "c", "b"]);
  });

  test("aborts the running lint when its document is linted again", async () => {
    const superseded = start(documentRequest("a", "a1"));
    const running = shellcheck.last();
    const newest = start(documentRequest("a", "a2"));

    assert.ok(running.signal.aborted);
    assert.ok(running.signal.reason instanceof RunSupersededError);
    await assert.rejects(superseded, RunSupersededError);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a1", "a2"]);
    shellcheck.last().resolve(clean);
    await newest;
  });

  test("leaves the running lint alone for another document", async () => {
    start(documentRequest("a"));
    start(documentRequest("b"));
    assert.strictEqual(shellcheck.last().signal.aborted, false);
  });

  test("drops a cancelled pending request", async () => {
    start(documentRequest("a"));
    const cancelled = start(documentRequest("b"));
    const next = start(documentRequest("c"));

    runner.cancel("file:///b.sh");
    await assert.rejects(cancelled, RunSupersededError);
    shellcheck.last().resolve(clean);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "c"]);
    shellcheck.last().resolve(clean);
    await next;
  });

  test("lets the running lint finish when its document is cancelled", async () => {
    const running = start(documentRequest("a"));
    runner.cancel("file:///a.sh");

    assert.strictEqual(shellcheck.last().signal.aborted, false);
    shellcheck.last().resolve(clean);
    assert.deepStrictEqual(await running, clean);
  });

  test("ignores a cancel with nothing to drop", () => {
    runner.cancel("file:///unknown.sh");
    runner.dispose();
    runner.cancel("file:///unknown.sh");
  });

  test("aborts a lint that overruns its timeout and moves on", async () => {
    const overrun = start({ ...documentRequest("a"), timeoutMs: 20 });
    const next = start(documentRequest("b"));

    await assert.rejects(
      overrun,
      (error: unknown) =>
        error instanceof RunTimeoutError &&
        error.message === "ShellCheck timed out after 0.02 s",
    );
    assert.strictEqual(logger.matching(/exceeded 20 ms/).length, 1);
    await settled();
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b"]);
    shellcheck.last().resolve(clean);
    await next;
  });

  test("does not stop a lint whose timeout is 0", async () => {
    start({ ...documentRequest("a"), timeoutMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(shellcheck.last().signal.aborted, false);
  });

  test("reports a failed lint as a runtime failure and moves on", async () => {
    const failed = start(documentRequest("a"));
    const next = start(documentRequest("b"));
    shellcheck
      .last()
      .reject(new Error("ShellCheck worker exited unexpectedly with code 1"));

    await assert.rejects(
      failed,
      (error: unknown) =>
        error instanceof WasmRuntimeError &&
        error.detail.includes("exited unexpectedly"),
    );
    await settled();
    shellcheck.last().resolve(clean);
    await next;
  });

  test("passes a module load failure through unchanged", async () => {
    const failure = new WasmRuntimeError(
      "The bundled ShellCheck wasm module could not be loaded",
      "detail",
    );
    const failed = start(documentRequest("a"));
    shellcheck.last().reject(failure);
    await assert.rejects(failed, (error: unknown) => error === failure);
  });

  test("rejects when the guest cannot enter the working directory", async () => {
    const failed = start(documentRequest("a"));
    shellcheck.last().resolve({
      stdout: "",
      stderr: "shellcheck: hs_init_ghc: chdir(/gone) failed with -1",
      exitCode: 1,
    });
    await assert.rejects(
      failed,
      (error: unknown) =>
        error instanceof WasmRuntimeError &&
        error.detail.includes("hs_init_ghc"),
    );
  });

  test("resolves and logs an exit code that is neither 0 nor 1", async () => {
    const result = start(documentRequest("a"));
    shellcheck.last().resolve({
      stdout: "",
      stderr: "unrecognized option\n",
      exitCode: 3,
    });
    assert.strictEqual((await result).exitCode, 3);
    assert.strictEqual(logger.matching(/exited with 3/).length, 1);
  });

  test("runs in the mount's working directory, or without files", async () => {
    const mount: LintMount = {
      fs: createWorkspaceFileSystem(vscode.Uri.file(fixtureRoot)),
      pwd: "/src",
    };
    start(lintRequest({ documentKey: "file:///a.sh", mount }));
    assert.deepStrictEqual(shellcheck.last().request.env, { PWD: "/src" });
    assert.strictEqual(shellcheck.last().request.fs, mount.fs);

    shellcheck.last().resolve(clean);
    await settled();
    start(lintRequest({ documentKey: "file:///b.sh" }));
    assert.deepStrictEqual(shellcheck.last().request.env, {});
    assert.strictEqual(shellcheck.last().request.fs, undefined);
  });

  test("rejects running and pending lints when disposed", async () => {
    maxConcurrentRuns = 2;
    const finished = start(documentRequest("a"));
    const running = start(documentRequest("b"));
    shellcheck.lintOf("a").resolve(clean);
    await finished;
    await settled();
    maxConcurrentRuns = 1;
    const pending = start(documentRequest("c"));
    const inPackage = shellcheck.lintOf("b");

    runner.dispose();
    await assert.rejects(running, RunnerDisposedError);
    await assert.rejects(pending, RunnerDisposedError);
    await assert.rejects(start(documentRequest("d")), RunnerDisposedError);
    assert.ok(inPackage.signal.aborted);
    assert.deepStrictEqual(shellcheck.submitted(), ["a", "b"]);
    // The idle instance and the running one.
    assert.deepStrictEqual([...shellcheck.disposed].sort(), [1, 2]);

    runner.dispose();
    assert.strictEqual(shellcheck.disposed.length, 2);
  });
});

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

function workerThreadIds(logger: RecordingLogger): number[] {
  return logger
    .matching(/worker \d+ started/)
    .map((line) => Number(/worker (\d+) started/.exec(line)?.[1]));
}

suite("WASM Runner on the packaged module", function () {
  // Compiling the 9.9 MiB module and terminating deliberately slow runs are
  // both well past the default mocha budget.
  this.timeout(180000);

  const extensionUri = vscode.Uri.file(repoRoot);
  const fixtureMount: LintMount = {
    fs: createWorkspaceFileSystem(vscode.Uri.file(fixtureRoot)),
    pwd: "/src",
  };
  let module: Promise<WebAssembly.Module>;
  const started: WasmRunner[] = [];

  suiteSetup(() => {
    assert.ok(
      fs.existsSync(workerPath),
      `${workerPath} is missing; run "npm run build" first`,
    );
    module = compilePackagedModule(extensionUri);
  });

  teardown(() => {
    started.splice(0).forEach((runner) => runner.dispose());
  });

  async function createRunner(): Promise<{
    runner: WasmRunner;
    logger: RecordingLogger;
    loads: () => number;
  }> {
    const logger = new RecordingLogger();
    let loads = 0;
    const runner = new WasmRunner({
      createShellCheck: await loadPackagedShellCheck({
        extensionUri,
        logger,
        loadModule: () => {
          loads++;
          return module;
        },
      }),
      logger,
      activeDocumentKey: () => undefined,
      maxConcurrentRuns: () => 0,
    });
    started.push(runner);
    return { runner, logger, loads: () => loads };
  }

  function fixtureRequest(overrides: Partial<LintRequest> = {}): LintRequest {
    return lintRequest({ mount: fixtureMount, ...overrides });
  }

  /**
   * The fixture mount, telling when the guest first reads from it: only then
   * is the lint running in a worker. Aborted any earlier, the package drops
   * it before it reaches one, and no worker needs replacing.
   */
  function watchedMount(): { mount: LintMount; reading: Promise<void> } {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => (started = resolve));
    const { fs } = fixtureMount;
    const watched = <A extends unknown[], R>(read: (...args: A) => R) => {
      return (...args: A): R => {
        started();
        return read(...args);
      };
    };
    return {
      reading,
      mount: {
        ...fixtureMount,
        fs: {
          stat: watched(fs.stat),
          readFile: watched(fs.readFile),
          readDirectory: watched(fs.readDirectory),
        },
      },
    };
  }

  test("matches the native binary byte for byte through workspace.fs", async () => {
    const { runner } = await createRunner();
    const native = nativeOutput();
    const result = await runner.run(fixtureRequest());

    assert.strictEqual(result.stdout, native.stdout);
    assert.strictEqual(native.status, 1);
    // Findings are a normal outcome, not a failure.
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stderr, "");
  });

  test("runs two lints at once on workers of their own", async () => {
    const { runner, logger, loads } = await createRunner();
    const slow = runner.run(fixtureRequest({ stdin: slowScript }));
    slow.catch(() => undefined);
    const quick = runner.run(
      fixtureRequest({ documentKey: "file:///fixture/src/quick.sh" }),
    );

    const first = await Promise.race([
      slow.then(() => "slow"),
      quick.then(() => "quick"),
    ]);
    assert.strictEqual(first, "quick");
    assert.strictEqual((await quick).stdout, nativeOutput().stdout);
    const threadIds = workerThreadIds(logger);
    assert.strictEqual(threadIds.length, 2, logger.lines.join("\n"));
    assert.notStrictEqual(threadIds[0], threadIds[1]);
    assert.strictEqual(loads(), 1, "the module was loaded more than once");
  });

  test("replaces the worker of a superseded lint without recompiling", async () => {
    const { runner, logger, loads } = await createRunner();
    const { mount, reading } = watchedMount();
    const superseded = runner.run(fixtureRequest({ stdin: slowScript, mount }));
    await reading;

    const newest = runner.run(fixtureRequest());
    await assert.rejects(superseded, RunSupersededError);
    assert.strictEqual((await newest).stdout, nativeOutput().stdout);

    const threadIds = workerThreadIds(logger);
    assert.strictEqual(threadIds.length, 2, logger.lines.join("\n"));
    assert.notStrictEqual(threadIds[0], threadIds[1]);
    assert.strictEqual(logger.matching(/terminated/).length, 1);
    assert.strictEqual(loads(), 1, "the module was loaded more than once");
  });

  test("terminates a lint that exceeds its timeout", async () => {
    const baseline = await createRunner();
    const startedAt = Date.now();
    await baseline.runner.run(fixtureRequest());
    const baselineMs = Date.now() - startedAt;
    baseline.runner.dispose();

    const budget = Math.max(1000, baselineMs * 4);
    const { runner, logger } = await createRunner();
    await assert.rejects(
      runner.run(fixtureRequest({ stdin: slowScript, timeoutMs: budget })),
      RunTimeoutError,
    );
    assert.strictEqual(logger.matching(/exceeded \d+ ms/).length, 1);

    // A new worker serves the next request.
    assert.strictEqual(
      (await runner.run(fixtureRequest())).stdout,
      nativeOutput().stdout,
    );
    assert.strictEqual(workerThreadIds(logger).length, 2);
  });

  test("does not count loading the module against the timeout", async () => {
    const baseline = await createRunner();
    const startedAt = Date.now();
    await baseline.runner.run(fixtureRequest());
    const budget = Math.max(1000, (Date.now() - startedAt) * 4);
    baseline.runner.dispose();

    // A module that takes longer to arrive than a lint may take, as a slow
    // download on the web would.
    const logger = new RecordingLogger();
    const runner = new WasmRunner({
      createShellCheck: await loadPackagedShellCheck({
        extensionUri,
        logger,
        loadModule: () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(module), budget * 2),
          ),
      }),
      logger,
      activeDocumentKey: () => undefined,
      maxConcurrentRuns: () => 0,
    });
    started.push(runner);

    assert.strictEqual(
      (await runner.run(fixtureRequest({ timeoutMs: budget }))).stdout,
      nativeOutput().stdout,
    );
  });

  test("rejects when the guest cannot enter the working directory", async () => {
    const { runner } = await createRunner();
    await assert.rejects(
      runner.run(
        fixtureRequest({ mount: { ...fixtureMount, pwd: "/no-such-dir" } }),
      ),
      (error: unknown) =>
        error instanceof WasmRuntimeError &&
        error.detail.includes("hs_init_ghc"),
    );
  });

  test("resolves and logs when shellcheck rejects an argument", async () => {
    const { runner, logger } = await createRunner();
    const result = await runner.run(
      fixtureRequest({ args: ["--no-such-flag", ...shellCheckArgs] }),
    );

    assert.strictEqual(result.exitCode, 3);
    assert.strictEqual(result.stdout, "");
    assert.match(result.stderr, /unrecognized option/);
    assert.strictEqual(logger.matching(/exited with 3/).length, 1);
  });

  test("reports a module that cannot be loaded on every lint", async () => {
    const logger = new RecordingLogger();
    const runner = new WasmRunner({
      createShellCheck: await loadPackagedShellCheck({
        extensionUri: vscode.Uri.file(path.join(repoRoot, "no-such-dir")),
        logger,
      }),
      logger,
      activeDocumentKey: () => undefined,
      maxConcurrentRuns: () => 0,
    });
    started.push(runner);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        runner.run(fixtureRequest()),
        (error: unknown) =>
          error instanceof WasmRuntimeError &&
          error.message ===
            "The bundled ShellCheck wasm module could not be loaded",
      );
    }
    assert.deepStrictEqual(workerThreadIds(logger), []);
  });

  test("terminates the worker when disposed mid-lint", async () => {
    const { runner, logger } = await createRunner();
    const { mount, reading } = watchedMount();
    const inFlight = runner.run(fixtureRequest({ stdin: slowScript, mount }));
    await reading;

    runner.dispose();
    await assert.rejects(inFlight, RunnerDisposedError);
    // Resolves only once the worker thread is really gone.
    await logger.wait(/worker \d+ terminated/);
  });
});

suite("WASM Bundles", () => {
  test("the worker imports the wasm package instead of inlining it", () => {
    const worker = fs.readFileSync(workerPath, "utf8");
    assert.match(
      worker,
      /from\s*"@vscode-shellcheck\/shellcheck-wasm\/worker"/,
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

  test("the web extension bundle carries none of the GPL guest", () => {
    // Bundling it would make the MIT extension a derivative work; the guest
    // runs from the package's own browser worker file instead.
    const extension = fs.readFileSync(webExtensionPath, "utf8");
    assert.doesNotMatch(extension, /wasi_snapshot_preview1|browser_wasi_shim/);
  });
});
