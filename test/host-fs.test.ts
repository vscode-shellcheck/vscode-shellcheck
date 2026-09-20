import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Fd, wasi as wasiDefs } from "@bjorn3/browser_wasi_shim";
import { HostPreopenDirectory } from "../src/runtime/wasm/host-fs.js";
import { createShimWasiHost } from "../src/runtime/wasm/wasi-host.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const fixtureRoot = path.join(repoRoot, "test", "fixtures", "wasi-host");
const realFixtureRoot = fs.realpathSync.native(fixtureRoot);
const shellCheckArgs = ["-f", "json1", "-s", "bash", "-"];

function read(fd: Fd, size: number): string {
  const { ret, data } = fd.fd_read(size);
  assert.strictEqual(ret, wasiDefs.ERRNO_SUCCESS);
  return Buffer.from(data).toString("utf8");
}

function openFile(preopen: HostPreopenDirectory, guestPath: string): Fd {
  const { ret, fd_obj: fd } = preopen.path_open(0, guestPath, 0, 0n, 0n, 0);
  assert.strictEqual(ret, wasiDefs.ERRNO_SUCCESS, `opening ${guestPath}`);
  assert.ok(fd);
  return fd;
}

suite("WASM Host Filesystem", () => {
  let scratch: string;
  let root: string;
  let outside: string;

  suiteSetup(() => {
    scratch = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "shellcheck-host-fs-")),
    );
    root = path.join(scratch, "root");
    outside = path.join(scratch, "outside");
    fs.mkdirSync(path.join(root, "inside"), { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(root, "inside", "ok.txt"), "inside\n");
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret\n");
    // A junction is the one symlink flavour Windows grants unprivileged
    // users, so the containment test runs on every platform.
    fs.symlinkSync(
      outside,
      path.join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    fs.symlinkSync(
      path.join(root, "inside"),
      path.join(root, "local"),
      process.platform === "win32" ? "junction" : "dir",
    );
  });

  suiteTeardown(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  test("reads files inside the preopen root", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      assert.strictEqual(
        read(openFile(preopen, "inside/ok.txt"), 64),
        "inside\n",
      );
      assert.strictEqual(
        read(openFile(preopen, "/inside/ok.txt"), 64),
        "inside\n",
      );
    } finally {
      preopen.dispose();
    }
  });

  test("rejects guest paths that leave the preopen root", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      for (const guestPath of [
        "../outside/secret.txt",
        "/../outside/secret.txt",
        "inside/../../outside/secret.txt",
      ]) {
        const opened = preopen.path_open(0, guestPath, 0, 0n, 0n, 0);
        assert.strictEqual(opened.ret, wasiDefs.ERRNO_NOENT, guestPath);
        assert.strictEqual(opened.fd_obj, null);
      }
    } finally {
      preopen.dispose();
    }
  });

  test("rejects a symlink inside the root that points outside it", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      // Textual containment alone accepts every one of these: the host path
      // stays under the root and only the resolved target escapes.
      const opened = preopen.path_open(0, "escape/secret.txt", 0, 0n, 0n, 0);
      assert.strictEqual(opened.ret, wasiDefs.ERRNO_NOENT);
      assert.strictEqual(opened.fd_obj, null);

      assert.strictEqual(
        preopen.path_filestat_get(0, "escape/secret.txt").ret,
        wasiDefs.ERRNO_NOENT,
      );
      assert.strictEqual(
        preopen.path_filestat_get(1, "escape").ret,
        wasiDefs.ERRNO_NOENT,
      );
      assert.strictEqual(
        preopen.path_readlink("escape").ret,
        wasiDefs.ERRNO_NOENT,
      );
      assert.strictEqual(
        preopen.path_open(0, "escape", 0, 0n, 0n, 0).ret,
        wasiDefs.ERRNO_NOENT,
      );

      // A symlink that stays inside the root is still usable.
      assert.strictEqual(
        read(openFile(preopen, "local/ok.txt"), 64),
        "inside\n",
      );
    } finally {
      preopen.dispose();
    }
  });

  test("rejects a file symlink pointing outside the root", function () {
    if (process.platform === "win32") {
      // Unprivileged Windows cannot create file symlinks; the directory
      // junction above covers the same rule.
      this.skip();
    }
    const linkPath = path.join(root, "secret-link");
    fs.symlinkSync(path.join(outside, "secret.txt"), linkPath);
    const preopen = new HostPreopenDirectory("/", root);
    try {
      assert.strictEqual(
        preopen.path_open(0, "secret-link", 0, 0n, 0n, 0).ret,
        wasiDefs.ERRNO_NOENT,
      );
      assert.strictEqual(
        preopen.path_readlink("secret-link").ret,
        wasiDefs.ERRNO_NOENT,
      );
    } finally {
      preopen.dispose();
      fs.unlinkSync(linkPath);
    }
  });

  test("refuses every mutating operation", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      const created = preopen.path_open(
        0,
        "new.txt",
        wasiDefs.OFLAGS_CREAT,
        0n,
        0n,
        0,
      );
      assert.strictEqual(created.ret, wasiDefs.ERRNO_ROFS);
      assert.strictEqual(fs.existsSync(path.join(root, "new.txt")), false);

      assert.strictEqual(
        preopen.path_open(0, "inside/ok.txt", wasiDefs.OFLAGS_TRUNC, 0n, 0n, 0)
          .ret,
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_open(0, "inside/ok.txt", wasiDefs.OFLAGS_EXCL, 0n, 0n, 0)
          .ret,
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_create_directory("fresh"),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_unlink_file("inside/ok.txt"),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_remove_directory("inside"),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_rename("inside/ok.txt", 0, "moved.txt"),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_link("hardlink.txt"),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_unlink("inside/ok.txt").ret,
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.path_filestat_set_times(0, "inside/ok.txt", 0n, 0n, 0),
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        preopen.fd_write(new TextEncoder().encode("nope")).ret,
        wasiDefs.ERRNO_ROFS,
      );

      const file = openFile(preopen, "inside/ok.txt");
      assert.strictEqual(
        file.fd_write(new TextEncoder().encode("nope")).ret,
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(
        file.fd_pwrite(new TextEncoder().encode("nope"), 0n).ret,
        wasiDefs.ERRNO_ROFS,
      );
      assert.strictEqual(file.fd_allocate(0n, 4n), wasiDefs.ERRNO_ROFS);
      assert.strictEqual(file.fd_filestat_set_size(0n), wasiDefs.ERRNO_ROFS);
      assert.strictEqual(
        fs.readFileSync(path.join(root, "inside", "ok.txt"), "utf8"),
        "inside\n",
      );
    } finally {
      preopen.dispose();
    }
  });

  test("only the preopen itself answers fd_prestat_get", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      const prestat = preopen.fd_prestat_get();
      assert.strictEqual(prestat.ret, wasiDefs.ERRNO_SUCCESS);
      assert.ok(prestat.prestat);

      const { ret, fd_obj: directory } = preopen.path_open(
        0,
        "inside",
        0,
        0n,
        0n,
        0,
      );
      assert.strictEqual(ret, wasiDefs.ERRNO_SUCCESS);
      assert.ok(directory);
      assert.strictEqual(
        directory.fd_prestat_get().ret,
        wasiDefs.ERRNO_BADF,
        "a subdirectory must not look like a preopen",
      );
      assert.strictEqual(
        read(openFile(preopen, "local/ok.txt"), 64),
        "inside\n",
      );
    } finally {
      preopen.dispose();
    }
  });

  test("enumerates a directory", () => {
    const preopen = new HostPreopenDirectory("/", root);
    try {
      const names: string[] = [];
      for (let cookie = 0n; ; cookie++) {
        const { ret, dirent } = preopen.fd_readdir_single(cookie);
        assert.strictEqual(ret, wasiDefs.ERRNO_SUCCESS);
        if (!dirent) {
          break;
        }
        names.push(Buffer.from(dirent.dir_name).toString("utf8"));
      }
      assert.deepStrictEqual(names.sort(), ["escape", "inside", "local"]);
    } finally {
      preopen.dispose();
    }
  });

  test("caps the host descriptors one run may hold", () => {
    const preopen = new HostPreopenDirectory("/", root, { maxOpenFiles: 2 });
    try {
      openFile(preopen, "inside/ok.txt");
      openFile(preopen, "inside/ok.txt");
      assert.strictEqual(
        preopen.path_open(0, "inside/ok.txt", 0, 0n, 0n, 0).ret,
        wasiDefs.ERRNO_MFILE,
      );
    } finally {
      preopen.dispose();
    }
  });

  test("dispose closes descriptors the guest left open", function () {
    if (process.platform !== "linux") {
      this.skip();
    }
    const before = fs.readdirSync("/proc/self/fd").length;
    const preopen = new HostPreopenDirectory("/", root);
    openFile(preopen, "inside/ok.txt");
    openFile(preopen, "inside/ok.txt");
    assert.strictEqual(fs.readdirSync("/proc/self/fd").length, before + 2);
    preopen.dispose();
    assert.strictEqual(fs.readdirSync("/proc/self/fd").length, before);
  });
});

suite("WASM Host ShellCheck Parity", function () {
  // Compiling the 7.6 MiB module and 200 guest runs are both well past the
  // default mocha budget.
  this.timeout(300000);

  const host = createShimWasiHost();
  const stdin = fs.readFileSync(path.join(fixtureRoot, "sub", "main.sh"));
  let wasmModule: WebAssembly.Module;

  suiteSetup(() => {
    wasmModule = new WebAssembly.Module(
      fs.readFileSync(path.join(repoRoot, "wasm", "shellcheck.wasm")),
    );
  });

  function runWasm(env?: Record<string, string>): string {
    const result = host.run({
      module: wasmModule,
      args: shellCheckArgs,
      stdin: new Uint8Array(stdin),
      env,
      preopen: { guestName: "/", hostRoot: fixtureRoot },
    });
    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.exitCode, 1);
    return result.stdout;
  }

  function fixtureDescriptors(): string[] {
    return fs.readdirSync("/proc/self/fd").flatMap((entry) => {
      try {
        const target = fs.readlinkSync(path.join("/proc/self/fd", entry));
        return target.startsWith(realFixtureRoot) ? [target] : [];
      } catch {
        // The descriptor the enumeration itself used is already gone.
        return [];
      }
    });
  }

  function codesOf(stdout: string): string[] {
    const parsed = JSON.parse(stdout) as {
      comments: { code: number; line: number }[];
    };
    return parsed.comments.map(
      (comment) => `SC${comment.code}@${comment.line}`,
    );
  }

  test("matches the native binary byte for byte", () => {
    const suffix = process.platform === "win32" ? ".exe" : "";
    const nativeBinary = path.join(
      repoRoot,
      "binaries",
      process.platform,
      process.arch,
      `shellcheck${suffix}`,
    );
    assert.ok(
      fs.existsSync(nativeBinary),
      `bundled shellcheck missing at ${nativeBinary}`,
    );

    const native = spawnSync(nativeBinary, shellCheckArgs, {
      cwd: path.join(fixtureRoot, "sub"),
      input: stdin,
      encoding: "utf8",
    });
    assert.strictEqual(native.error, undefined);
    assert.strictEqual(native.status, 1);
    assert.deepStrictEqual(codesOf(native.stdout), ["SC2086@8"]);

    assert.strictEqual(runWasm({ PWD: "/sub" }), native.stdout);
  });

  test("without PWD the rc file and the sourced file are not found", () => {
    // Proof that the fixture really depends on the emulated working
    // directory: SC1091 is the unresolved source, SC2034 the unapplied
    // disable= in sub/.shellcheckrc.
    const codes = codesOf(runWasm());
    assert.ok(codes.includes("SC1091@3"), codes.join(" "));
    assert.ok(codes.includes("SC2034@5"), codes.join(" "));
  });

  test("does not leak host descriptors over 200 runs", function () {
    if (process.platform !== "linux") {
      this.skip();
    }
    // Scoped to descriptors on the fixture rather than the raw count: the
    // extension host opens unrelated descriptors from other threads while
    // this runs, and only the ones this host opened are ours to close.
    assert.deepStrictEqual(fixtureDescriptors(), []);
    for (let i = 0; i < 200; i++) {
      runWasm({ PWD: "/sub" });
    }
    assert.deepStrictEqual(fixtureDescriptors(), []);
  });
});
