# Experimental WebAssembly (WASI) runtime for ShellCheck

Implementation plan for issue #1713. Evidence base:
[`wasm-runtime-spike-report.md`](./wasm-runtime-spike-report.md) and
[`wasm-runtime-soak-report.md`](./wasm-runtime-soak-report.md). All design
decisions in §2 are settled with the maintainer and are not re-opened here;
§13 lists only what the decisions do _not_ answer.

## 1. Goal and non-goals

**Goal.** Add a second, opt-in ShellCheck execution backend that runs the
upstream ShellCheck 0.11.0 WASI _command_ build inside the extension host,
producing diagnostics indistinguishable from the native binary, so that a
single ~1.7 MiB (compressed) artifact can eventually replace seven
per-platform binaries and unlock VS Code for the Web (#478).

**Non-goals for this work.**

- Replacing or deprecating the native path. `native` stays the default.
- Automatic fallback between runtimes in either direction.
- Cancellation for the native path (separate follow-up; see §14).
- Web/browser support. The WASI host in this plan is backed by `node:fs`;
  the _interface_ is designed so a browser backend can be added later, but
  no browser backend is written here and `virtualWorkspaces.supported`
  stays `false` (`package.json:56-59`).
- Closing the performance gap. ~4x native is accepted for an experimental
  runtime; §14 states the bar for graduating.
- A virtual-file overlay so the JSON `file` field carries a real path. Not
  needed: we feed stdin, so `file` is `"-"` for both runtimes
  (spike §4(c)).

## 2. Requirements (settled decisions, restated)

### 2.1 Configuration

| #   | Requirement                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | New setting `shellcheck.runtime`, enum `"native" \| "wasm"`, default `"native"`, scope `window`, `tags: ["experimental"]`, description marks it experimental.                                                  |
| C2  | The setting takes effect in untrusted workspaces: it is **not** added to `capabilities.untrustedWorkspaces.restrictedConfigurations`. Rationale: the WASI mount is a read-only sandbox we implement ourselves. |
| C3  | In wasm mode `shellcheck.executablePath` is ignored. Log exactly one line to the output channel when it is set and non-empty. No modal, no toast.                                                              |
| C4  | In wasm mode the `shellcheck -V` probe is skipped entirely; the tool version is a build-time constant.                                                                                                         |
| C5  | All other settings keep their current meaning: `exclude`, `customArgs`, `useWorkspaceRootAsCwd`, `run`, `enable`, `enableQuickFix`, `ignorePatterns`, `ignoreFileSchemes`.                                     |
| C6  | Native mode, no binary found: the existing error surface gains an action **"Try experimental WASM runtime"** which writes `shellcheck.runtime = "wasm"` at global (user) scope and does nothing else.          |
| C7  | wasm failure (load failure, crash, watchdog timeout): **no fallback to native**. Show the error **once per session** with a **"Switch back to native"** action. Full details go to the output channel.         |

### 2.2 Runtime architecture

| #   | Requirement                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Use the WASI **command** build (exports `_start`). Not a reactor. Rationale: byte-identical `json1` output vs native (spike §3, §4(c)); the reactor's `fix` payload schema differs (spike §5.6) and it has no `.shellcheckrc` discovery.                                                            |
| R2  | WASI host is `@bjorn3/browser_wasi_shim` plus a custom **read-only** preopen directory backed by synchronous `node:fs`. `node:wasi` is rejected: SIGSEGV with `preopens` on Node 22 (spike §2; soak exp 7a/7b, 4/5 and 3/5 attempts) and a hard 2 fd/run leak with no release API (soak exp 1/2/6). |
| R3  | The whole WASI host sits behind **one module and one interface** so it can be swapped for a zero-dependency or browser-fs implementation without touching callers.                                                                                                                                  |
| R4  | Execution happens in **one long-lived `worker_threads` Worker**.                                                                                                                                                                                                                                    |
| R5  | The **main thread** compiles the module once, retains the `WebAssembly.Module`, and posts it to the Worker. Structured clone works, worker-side "compile" is then ~0.01 ms, and the original stays usable, so respawn never recompiles from bytes (spike §5.4/C4b).                                 |
| R6  | A **fresh `WebAssembly.Instance` per lint**, mandatory. Re-running `_start` on a used Instance throws `RuntimeError: unreachable` (spike §6/D4).                                                                                                                                                    |
| R7  | Worker spawn and module precompile happen at **activation time, only when `runtime === "wasm"`**. Native users pay zero cost: no wasm file read, no Worker, no `browser_wasi_shim` import evaluated.                                                                                                |
| R8  | Toggling the setting starts/stops the Worker dynamically. **No window reload.**                                                                                                                                                                                                                     |
| R9  | No idle reclamation, no Worker pool.                                                                                                                                                                                                                                                                |

### 2.3 Input and filesystem mapping

| #   | Requirement                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | The document is fed through **stdin** with the `-` argument, exactly as native does today (`src/linter.ts:557`). The parser and `json1` handling are untouched; `file` is `"-"` for both runtimes.                                                                               |
| F2  | The native `cwd` is emulated with `env.PWD` = guest path of the directory the native path would have used. `-P` is **not** sufficient: it fixes `source` resolution but not `.shellcheckrc` discovery (spike §4(c), the `-P /proj/sub -x` row still reports SC2034).             |
| F3  | `PWD` **must** point inside the preopen tree. Otherwise the GHC RTS `chdir` fails and stdout is silently empty (spike §3: `hs_init_ghc: chdir(...) failed with -1`, `stdout.len=0`). Treat "PWD outside preopen" as a bug to guard against, not a runtime condition to tolerate. |
| F4  | Preopen root = the document's workspace folder root. If the document belongs to no workspace folder, the document's own directory. Multi-root: the folder that owns the document.                                                                                                |
| F5  | Files outside the preopen root are invisible to `source` and `.shellcheckrc` lookup. Documented, accepted limitation.                                                                                                                                                            |
| F6  | Windows: guest paths are POSIX; the drive letter is absorbed into the preopen mapping (guest `/` → host `C:\proj`, `PWD` = `/sub`). The host-side containment check must stay correct with `path.sep`.                                                                           |

### 2.4 Scheduling and cancellation (wasm path only)

| #   | Requirement                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | One lint at a time in the Worker.                                                                                                                                                                                             |
| S2  | Per document, keep only the newest queued request. Drop stale results.                                                                                                                                                        |
| S3  | A new request for the document **currently being linted** → `worker.terminate()` the in-flight run and respawn, posting the retained Module back. Do not recompile. (`terminate()` ~6 ms, respawn ~75-100 ms — spike §5.4/D.) |
| S4  | Requests for **other** documents queue.                                                                                                                                                                                       |
| S5  | Watchdog: a single run exceeding **30 s** → terminate + surface per C7.                                                                                                                                                       |
| S6  | In wasm mode the `onType` debounce rises from 250 ms to **750 ms**.                                                                                                                                                           |
| S7  | The default value of `shellcheck.run` is deliberately **not** changed per runtime.                                                                                                                                            |

### 2.5 Artifact and packaging

| #   | Requirement                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Source: `wasilibs/go-shellcheck`, path `internal/wasm/shellcheck.wasm`, pinned by commit SHA, verified by sha256. Known-good: commit `24025c1590296bcce8e494624e8c3561740a32a4`, sha256 `f9d99fa45ae12d5b735425e6a32f6ea3cc550095b1e82ec1b770141470278c20`, 7,650,497 bytes raw (~1.68 MiB compressed), ShellCheck 0.11.0 — the same version `bindl.config.ts:3` pins for native. |
| P2  | Downloaded at build time into a gitignored directory, alongside how native binaries are fetched today — but **it must be fetched even when `BINDL_SKIP=true`**. The `universal` VSIX target sets that (`.github/workflows/ci.yaml:98-102`) and is precisely the target that needs the wasm.                                                                                       |
| P3  | The wasm ships in **every** VSIX target, platform-specific and `universal`.                                                                                                                                                                                                                                                                                                       |
| P4  | Ship ShellCheck's GPLv3 LICENSE plus a provenance note (upstream ShellCheck version, go-shellcheck commit) next to the wasm, consistent with how the repo handles the native binaries today.                                                                                                                                                                                      |
| P5  | `.vscodeignore`, `esbuild.js` and the Worker entry point are all handled. The Worker locates the wasm via `context.extensionUri`. Local read only; never fetch at runtime.                                                                                                                                                                                                        |

### 2.6 Testing

| #   | Requirement                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Parameterise the core integration tests over both runtimes.                                                                                                                                                            |
| T2  | Parity fixtures asserting native and wasm produce identical diagnostics: (a) a plain script, (b) a script relying on a **parent-directory** `.shellcheckrc`, (c) a script using `source` with `-x`/`external-sources`. |
| T3  | Run on all three CI OSes. The Windows path mapping is only exercised there.                                                                                                                                            |

### 2.7 Decisions added after the first plan review

Raised by §13 of the first draft, settled with the maintainer. They carry the
same weight as §2.1-§2.6.

| #   | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C8  | **Non-`file:` documents** (`vscode-remote:`, `vscode-vfs:`, anything `getWorkspaceFolderPath(uri, true)` rejects) run in wasm mode with **no preopen and no `PWD`** — the degenerate but valid mapping the spike measured (§3). Log one line to the output channel naming the document and the consequence (`.shellcheckrc` and `source` will not resolve). Do **not** substitute an unrelated `file:` workspace folder as the preopen root: a wrong mount produces wrong diagnostics, which is worse than none. Do not refuse to lint. |
| C9  | **`customArgs` are passed through verbatim**, including path-bearing flags. Additionally, in wasm mode detect host-absolute paths in `customArgs` (post-`substitutePath`, which expands `${workspaceFolder}` to a _host_ path — `src/settings.ts:77`) and log one warning naming the offending argument. Never rewrite them: "looks like a path" is not reliably decidable, and a silently wrong rewrite is harder to diagnose than a silently ignored flag. README lists this as a wasm limitation.                                    |
| T4  | The parity suite gets its **own `.vscode-test.js` config entry** with a `workspaceFolder`, rather than adding one to the existing entry. Rationale: the existing native integration tests run today with no folder open, and changing that environment for them is an unrelated behaviour change bundled into this work.                                                                                                                                                                                                                |
| C10 | `collectDiagnostics` (`src/linter.ts:403-409`) in wasm mode prints `Runtime: wasm` and `Version: 0.11.0 (bundled wasm)`, and omits the `Bundled:` line.                                                                                                                                                                                                                                                                                                                                                                                 |
| S8  | The 30 s watchdog is **hard-coded**, not a setting, for the experimental phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P6  | Add a Renovate custom regex manager for the pinned go-shellcheck commit SHA and sha256, so the artifact does not silently rot (`renovate.json`).                                                                                                                                                                                                                                                                                                                                                                                        |
| D1  | The README's wasm section recommends `shellcheck.run: "onSave"` for large files. This is guidance only — the default value of `shellcheck.run` is not changed per runtime (S7).                                                                                                                                                                                                                                                                                                                                                         |

## 3. Module layout and the seam

```
src/
  linter.ts                      # modified: delegates execution to a runner
  settings.ts                    # modified: + runtime key, + runtime field
  runtime/
    types.ts                     # ShellCheckRunner, LintRequest, LintResult, errors
    manager.ts                   # RuntimeManager: owns the current runner, epochs
    native-runner.ts             # execa; body lifted verbatim from linter.ts:572-616
    wasm/
      wasm-runner.ts             # main thread: compile, own Worker, queue, watchdog
      protocol.ts                # message types, shared main <-> worker
      worker.ts                  # Worker entry point -> dist/wasm-worker.js
      wasi-host.ts               # WasiHost interface + createShimWasiHost()  <= swap seam
      host-fs.ts                 # HostPreopenDirectory / HostDirectory / HostFile
      guest-path.ts              # host <-> guest path translation (pure, unit-testable)
      version.ts                 # WASM_TOOL_VERSION (re-exports bindl.config version)
scripts/
  fetch-wasm.mjs                 # build-time download + sha256 verify + provenance
wasm/                            # gitignored build output
  shellcheck.wasm
  LICENSE.shellcheck             # GPLv3
  PROVENANCE.md
```

### 3.1 `ShellCheckRunner` — the outer seam

`src/runtime/types.ts`:

```ts
import type { SemVer } from "semver";

/** Everything the linter has already computed; no vscode types cross this line. */
export interface LintRequest {
  /** Dedupe/cancellation key. Always `textDocument.uri.toString()`. */
  readonly documentKey: string;
  /** Fully built argv, excluding argv[0]. Always ends with "-". */
  readonly args: readonly string[];
  /** Document text, exactly `textDocument.getText()`. */
  readonly stdin: string;
  /** Host cwd the native path would use, already validated to exist, or undefined. */
  readonly cwd: string | undefined;
}

export interface LintResult {
  readonly stdout: string;
  readonly stderr: string;
  /** null when the runtime does not report one (native today ignores it). */
  readonly exitCode: number | null;
}

export type RuntimeKind = "native" | "wasm";

export interface ShellCheckRunner {
  readonly kind: RuntimeKind;
  /** native: spawns `-V`. wasm: resolves the build-time constant, never spawns. */
  getToolVersion(): Promise<SemVer>;
  run(request: LintRequest): Promise<LintResult>;
  /** Idempotent. wasm: terminates the Worker, rejects pending runs with RunnerDisposedError. */
  dispose(): void;
}

/** Thrown when a run is dropped because the runner was disposed or superseded. */
export class RunnerDisposedError extends Error {}
/** Thrown when a run is superseded by a newer request for the same document. */
export class RunSupersededError extends Error {}
/** Thrown when the wasm runtime itself failed (load, trap, watchdog). Triggers C7. */
export class WasmRuntimeError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}
```

Both `RunnerDisposedError` and `RunSupersededError` are **silent** at the
linter level: no diagnostics update, no error UI. Only `WasmRuntimeError`
reaches C7.

### 3.2 `WasiHost` — the inner (swappable) seam

`src/runtime/wasm/wasi-host.ts`. This is the only file that imports
`@bjorn3/browser_wasi_shim`, and the only file that imports `node:fs` on the
wasm path.

```ts
export interface WasiPreopen {
  /** Guest name. Always "/" in this plan. */
  readonly guestName: string;
  /** Absolute host path, already resolved and drive-case-normalised. */
  readonly hostRoot: string;
}

export interface WasiRunOptions {
  readonly args: readonly string[]; // argv[1..]; argv[0] is added by the host
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: Uint8Array;
  readonly preopen?: WasiPreopen;
}

export interface WasiRunOutcome {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface WasiHost {
  /**
   * Synchronous: instantiates `module` fresh and runs `_start` to completion.
   * Must create a new Instance every call (R6) and must close every host fd
   * it opened before returning, including on throw.
   */
  run(module: WebAssembly.Module, options: WasiRunOptions): WasiRunOutcome;
}

export function createShimWasiHost(): WasiHost;
```

Swapping in a zero-dependency WASI implementation, or a browser `FileSystem`
backend for #478, means providing another `createXWasiHost()` and changing one
line in `worker.ts`. Nothing else moves.

## 4. The single spawn site, and how it becomes runtime-agnostic

Today there is **exactly one** process spawn for linting:

- `src/linter.ts:576` — `const childProcess = execa(executable.path, args, { cwd });`

(There is a second, unrelated spawn for the version probe at
`src/utils/tool-check.ts:31`.)

`runLint` (`src/linter.ts:524-618`) already computes everything the spawn
needs as plain values:

| Input           | Where it is computed today                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| `args`          | `src/linter.ts:540-557` — format, `-e`, `-s`, `customArgs`, trailing `-`          |
| `cwd`           | `src/linter.ts:559-564` + `ensureCurrentWorkingDirectory` at `:572`               |
| stdin text      | `src/linter.ts:581` — `textDocument.getText()`                                    |
| output consumed | `src/linter.ts:587-600` — concatenated stdout string, then `parser.parse(output)` |

Note the current code **ignores the exit code entirely**: it only listens for
stdout `end` and parses whatever arrived. The wasm runner mirrors this (§8).

**After the change**, `runLint` becomes:

1. Build `args`, `stdin`, `cwd` exactly as today (unchanged code).
2. `const result = await this.runtimeManager.getRunner().run({documentKey, args, stdin, cwd})`.
3. On resolve: `if (result.stdout.length) parser.parse(result.stdout)`, then
   `setResultCollections`, exactly as `src/linter.ts:592-599` does today.
4. On `RunnerDisposedError` / `RunSupersededError`: return without touching
   diagnostics.
5. On any other error: existing `handleError` for native; C7 policy for
   `WasmRuntimeError`.

`NativeRunner.run()` contains the body of `src/linter.ts:566-616` verbatim,
with `handleError`'s `toolStatusByPath` mutation hoisted back into the linter
(the runner does not know about tool status; it rejects with the original
`NodeJS.ErrnoException` and the linter maps it with the existing
`toolStatusByError`, `src/linter.ts:38-47`).

### 4.1 `RuntimeManager`

`src/runtime/manager.ts` owns the currently active runner and an **epoch
counter**.

```ts
class RuntimeManager implements vscode.Disposable {
  constructor(context: vscode.ExtensionContext);
  /** Reads `shellcheck.runtime` (window scope), creates the runner lazily. */
  getRunner(): ShellCheckRunner;
  get kind(): RuntimeKind;
  /** Called from onDidChangeConfiguration. Disposes the old runner if the kind changed. */
  refresh(): void;
  dispose(): void;
}
```

- Construction of a `WasmRunner` immediately reads `wasm/shellcheck.wasm`,
  compiles it, spawns the Worker and posts `init` (R7). Construction of a
  `NativeRunner` does nothing.
- `refresh()` compares the new kind with `this.runner?.kind`. On change it
  bumps the epoch, calls `dispose()` on the old runner, and drops it. The next
  `getRunner()` constructs the new one.
- Because the setting is `window`-scoped (C1), one runner per window is
  correct and `getRunner()` takes no scope argument.

## 5. Path mapping, `PWD`, and Windows

### 5.1 Choosing the preopen root and `PWD`

`cwd` is whatever `src/linter.ts:559-564` already computes, post-validation by
`ensureCurrentWorkingDirectory` (`src/utils/path.ts:59-76`):

| `useWorkspaceRootAsCwd` | `cwd` (native, today)                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| `true`                  | `getWorkspaceFolderPath(textDocument.uri)` (`src/utils/path.ts:32-55`) |
| `false`                 | `guessDocumentDirname(textDocument)` (`src/utils/path.ts:18-30`)       |

The wasm runner derives, in `guest-path.ts`:

```
preopenRoot =
  getWorkspaceFolderPath(uri)          // F4: the folder that owns the document
  ?? guessDocumentDirname(document)    // F4: no folder -> document's own directory
  ?? undefined

if (preopenRoot === undefined || cwd === undefined)   -> run with NO preopen and NO PWD
else if (!contains(preopenRoot, cwd))                 -> preopenRoot = cwd   // F3 guard
PWD = toGuest(preopenRoot, cwd)
```

The `contains` re-rooting guard is load-bearing. `getWorkspaceFolderPath`
falls back to _the first_ workspace folder when the URI belongs to none
(`src/utils/path.ts:44-52`), so in a multi-root window a file outside every
folder would otherwise produce a `cwd` that is not under `preopenRoot` — and
per F3 that yields silent empty stdout, i.e. all diagnostics quietly
disappearing. Re-rooting the preopen at `cwd` keeps `PWD = "/"` and is
strictly safe; the cost is that `.shellcheckrc` discovery cannot walk above
`cwd`, which is the F5 limitation anyway.

`getWorkspaceFolderPath` already applies `fixDriveCasingInWindows`
(`src/utils/path.ts:8-12`); `guessDocumentDirname` does not, so the wasm path
applies it to both before comparing (Windows drive-letter case must match or
`contains` yields a false negative).

### 5.2 Host → guest (`toGuest`)

```
toGuest(root, hostPath):
  rel = path.relative(root, hostPath)                 // platform-native separators
  if rel === ""                       -> "/"
  if rel starts with ".." or path.isAbsolute(rel)     -> throw OutsidePreopenError
  return "/" + rel.split(path.sep).join("/")
```

On Windows, `path.relative` returns backslash-separated relatives; the split
on `path.sep` converts them to the POSIX guest form. A literal `/` cannot
appear in a Windows path component, so no escaping is needed in this
direction.

### 5.3 Guest → host (`fromGuest`, inside `host-fs.ts`)

```
fromGuest(root, guestPath):
  if process.platform === "win32" && guestPath includes "\\"  -> ERRNO_NOENT
  rest = guestPath with leading "/" stripped
  host = path.resolve(root, rest)                     // normalises "." and ".."
  if !(host === root || host.startsWith(root + path.sep)) -> ERRNO_NOENT
  real = fs.realpathSync.native(host)                 // symlink containment, §13 R-3
  if !(real === root || real.startsWith(root + path.sep)) -> ERRNO_NOENT
  return host
```

The `\\` rejection matters: `\` is a legal, ordinary filename character in
WASI guest paths, but `path.resolve` on win32 treats it as a separator, so a
guest path `a\..\..\secret` would escape via a route the textual containment
check cannot see. Reject rather than escape — shellcheck never produces such
paths.

`root` is `path.resolve()`d and drive-case-normalised once, at construction.

### 5.4 Worked Windows example

```
document:       C:\proj\sub\main.sh
workspace root: C:\proj
useWorkspaceRootAsCwd = false  ->  cwd = C:\proj\sub

preopen:  guestName "/"  ->  hostRoot "C:\proj"
env.PWD:  "/sub"
argv:     ["shellcheck", "-f", "json1", "-", ...]
guest sees: /  /sub  /sub/main.sh  /.shellcheckrc  /lib/util.sh
```

A document on a different drive than the workspace root falls out of the
`contains` guard in §5.1 and re-roots the preopen at its own directory. A
second preopen for a second drive is explicitly not implemented.

## 6. The WASI host

`createShimWasiHost()` drives `@bjorn3/browser_wasi_shim` exactly as
`/tmp/shellcheck-wasm-spike/lib-cmd.mjs::runShim` does, with three details
carried over verbatim:

- `new WASI(argv, envArray, fds, { debug: false })`. The **fourth argument is
  mandatory**: the shim calls `debug.enable(options.debug)` and
  `enable(undefined)` turns logging _on_ for a process-global singleton.
- `argv[0]` is `"shellcheck"`.
- `env` is passed as a `KEY=VALUE` string array, not an object.
- `wasi.start(instance)` **returns** the exit code and does not throw for a
  normal exit (spike §6). Calling `_start()` directly instead throws
  `WASIProcExit`.

Fds: `[MemStdin(stdin), MemStdout(), MemStdout(), ...preopen ? [HostPreopenDirectory] : []]`.

### 6.1 Productionising `lib-shim-fs.mjs`

The prototype at `/tmp/shellcheck-wasm-spike/lib-shim-fs.mjs` is functionally
correct (spike §4, `byteEqualToNative=true`) but needs the following before it
ships. This is the full list.

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                     | Why                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Port to TypeScript; type the shim's `Fd` return shapes (`{ret, filestat}`, `{ret, data}`, `{ret, fd_obj}`) explicitly. The shim's `.d.ts` is loose; the repo runs `strict` + `noImplicitAny` (`tsconfig.json`).                                                                                                                                                                                                            | Repo convention.                                                                                                                              |
| 2   | **Split the class in two.** The prototype returns `new HostPreopenDirectory(path, h)` from `path_open` for subdirectories (line 94), which makes every opened subdirectory answer `fd_prestat_get` with a `Prestat`. Only real preopens may do that. Introduce `HostDirectory` (no `fd_prestat_get`, returns `ERRNO_BADF`) and have `HostPreopenDirectory extends HostDirectory` add only `fd_prestat_get`/`prestat_name`. | Correctness; guest libc preopen enumeration must not see phantom preopens.                                                                    |
| 3   | **Symlink containment.** `resolve()` (lines 65-68) is textual only. Add the `fs.realpathSync.native` check from §5.3 to `path_open`, `path_filestat_get` and `path_readlink`.                                                                                                                                                                                                                                              | Without it a symlink inside the workspace reads arbitrary host files — which breaks the C2 justification.                                     |
| 4   | **Reject `\` in guest paths on win32** before `path.resolve` (§5.3).                                                                                                                                                                                                                                                                                                                                                       | Separator/filename-character mismatch.                                                                                                        |
| 5   | **Track and close fds.** `HostFile`'s constructor calls `fs.openSync` (line 34) and only `fd_close` releases it. If the guest exits without closing, the fd leaks. Have the preopen keep a `Set<HostFile>` of live children and close them all in a `dispose()` the host calls in a `finally` around `wasi.start()`.                                                                                                       | We rejected `node:wasi` _because_ of its fd leak (soak exp 1/2); we must not reproduce it.                                                    |
| 6   | **`Buffer.allocUnsafe` aliasing.** `fd_read`/`fd_pread` (lines 38-48) return a `Uint8Array` view over a pooled `Buffer`. Return `new Uint8Array(buf.subarray(0, n))` (a copy) or use `Buffer.alloc`.                                                                                                                                                                                                                       | The shim may retain the view; pooled memory is reused.                                                                                        |
| 7   | **BigInt stats.** Use `fs.statSync(p, { bigint: true })` and drop the `BigInt(st.ino)` / `BigInt(st.dev)` conversions (lines 17-19). Windows reports `ino === 0`; large inodes lose precision through `number`.                                                                                                                                                                                                            | Correctness.                                                                                                                                  |
| 8   | **Error mapping.** Extend `errnoOf` (lines 22-31) with `EPERM`→`ERRNO_PERM`, `ELOOP`→`ERRNO_LOOP`, `ENAMETOOLONG`→`ERRNO_NAMETOOLONG`, `EMFILE`/`ENFILE`→`ERRNO_MFILE`/`ERRNO_NFILE`, `EBUSY`→`ERRNO_BUSY`. Keep `ERRNO_IO` as the default. Never let a Node exception escape into the shim.                                                                                                                               | The soak report (exp 5) shows EMFILE is a _catchable_ JS throw; an escaping throw would corrupt the wasm stack instead of returning an errno. |
| 9   | **Keep write rejection.** `path_create_directory` / `path_unlink_file` / `path_remove_directory` return `ERRNO_ROFS`; `path_open` rejects `O_CREAT`/`O_TRUNC`/`O_EXCL` (line 89). Add `path_rename`, `path_symlink`, `path_link`, `fd_write`, `fd_allocate`, `fd_filestat_set_size`, `path_filestat_set_times` → `ERRNO_ROFS`.                                                                                             | The class is the sandbox boundary; every mutating entry point must be explicitly denied, not merely absent.                                   |
| 10  | **Keep `fd_readdir_single`** (lines 99-107) even though shellcheck never calls `fd_readdir` (spike §4(d)). It is cheap and its absence would be a hard failure if a future ShellCheck version enumerates a directory.                                                                                                                                                                                                      | Defensive.                                                                                                                                    |
| 11  | Add a hard cap on concurrently open `HostFile`s (e.g. 256) returning `ERRNO_MFILE` past it.                                                                                                                                                                                                                                                                                                                                | A pathological `source` loop must not exhaust the extension host's fd budget.                                                                 |

Unit tests for `host-fs.ts` and `guest-path.ts` run headless (no VS Code) —
see §12 PR 3.

## 7. Worker protocol, scheduling, cancellation

### 7.1 Messages

`src/runtime/wasm/protocol.ts`:

```ts
// main -> worker
export type MainToWorker =
  | { type: "init"; module: WebAssembly.Module }
  | {
      type: "run";
      id: number;
      args: string[];
      env: Record<string, string>;
      stdin: Uint8Array; // transferred
      preopen?: { guestName: string; hostRoot: string };
    };

// worker -> main
export type WorkerToMain =
  | { type: "ready" }
  | {
      type: "result";
      id: number;
      exitCode: number;
      stdout: Uint8Array;
      stderr: Uint8Array;
    } // both transferred
  | { type: "failed"; id: number; message: string; stack?: string }
  | { type: "log"; level: "debug" | "info" | "error"; message: string };
```

`init` carries the compiled `WebAssembly.Module` (R5). The worker replies
`ready` after storing it — no bytes are read in the worker, and `wasm/` is
never opened there.

`stdin`, `stdout` and `stderr` are `Uint8Array`s moved through the
`transferList`, so a 260 KB `json1` payload (spike §5.2, large.sh) is not
copied.

The `log` message exists because `src/utils/logging` writes to a
`vscode.OutputChannel`, which is main-thread only.

### 7.2 `WasmRunner` state

```
state: "starting" | "idle" | "running" | "terminating" | "failed"
module: WebAssembly.Module          // retained on the main thread forever
worker: Worker | undefined
inFlight: { id, documentKey, resolve, reject, timer } | undefined
queue: Map<documentKey, PendingRequest>   // S2: Map => newest-per-document, insertion-ordered
```

`queue` being a `Map` keyed by `documentKey` gives S2 and S4 for free: a
`set()` on an existing key replaces the payload and keeps the original
insertion position, so a re-typed document does not jump ahead of another
document that has been waiting.

### 7.3 Lifecycle

**Activation (R7).** Only when `shellcheck.runtime === "wasm"`:

```
bytes  = fs.readFileSync(Uri.joinPath(context.extensionUri, "wasm", "shellcheck.wasm").fsPath)
module = await WebAssembly.compile(bytes)          // ~55 ms cold (spike §5.1)
worker = new Worker(Uri.joinPath(context.extensionUri, "dist", "wasm-worker.js").fsPath)
worker.postMessage({ type: "init", module })
await ready                                        // ~120 ms total (spike §5.4)
```

A read or compile failure → `state = "failed"` and C7 fires on the first lint
attempt, not at activation time (an error toast during startup, before the
user has looked at a shell script, is worse than one on first use).

**Dispatch.**

```
run(req):
  if state === "failed" -> reject WasmRuntimeError (C7 dedupes the UI)
  existing = queue.get(req.documentKey)
  if existing -> existing.reject(RunSupersededError)      // S2
  queue.set(req.documentKey, req)
  if inFlight?.documentKey === req.documentKey -> cancelInFlight()   // S3
  pump()
```

**`cancelInFlight()` (S3 / S5), exact sequence:**

1. `clearTimeout(inFlight.timer)`.
2. `inFlight.reject(RunSupersededError)` (or `WasmRuntimeError("watchdog")`
   when triggered by S5).
3. `inFlight = undefined`; `state = "terminating"`.
4. `const dead = this.worker; this.worker = undefined;`
5. `await dead.terminate()` — ~6 ms (spike §5.4/D).
6. `this.worker = new Worker(workerPath)`; wire handlers.
7. `this.worker.postMessage({ type: "init", module: this.module })` — the
   **retained** Module (R5). Worker-side compile ~0.01 ms.
8. On `ready`: `state = "idle"; pump()`.

Total ~75-100 ms before the next `_start` begins (spike §5.4/D, §6).

Steps 4-5 must null out `this.worker` **before** awaiting `terminate()`, so a
`run()` arriving during the await queues rather than posting to a dying
worker.

**`pump()`.** If `state !== "idle"` or `queue` is empty, return. Otherwise
shift the first entry, set `inFlight`, arm a 30 s `setTimeout` (S5), and
`postMessage` a `run`.

**Watchdog (S5).** On fire: run `cancelInFlight()` with a
`WasmRuntimeError("ShellCheck (wasm) timed out after 30s")`, log the document
URI and argv to the output channel, and let C7 show the once-per-session
error. The 30 s budget is ~7x the measured worst case in the spike (4.3 s for
a 50 KB / 1500-line script, §5.2).

**Unexpected worker death.** `worker.on("exit")` with `state !== "terminating"`
→ reject `inFlight` with `WasmRuntimeError`, set `state = "failed"`, reject
the whole queue. Do **not** auto-respawn: the soak report (exp 7b) shows a
native-level crash inside a Worker can take the whole extension host down, so
a respawn loop on a genuinely broken module would be a crash loop.

**Setting toggled mid-flight (R8).** `onDidChangeConfiguration`
(`src/linter.ts:167-177`) fires → `RuntimeManager.refresh()` →
`oldRunner.dispose()`:

- `WasmRunner.dispose()`: clear watchdog, `worker.terminate()`, reject
  `inFlight` and every queued entry with `RunnerDisposedError`, drop the
  Module reference.
- `NativeRunner.dispose()`: the in-flight `execa` child is **not** killed
  (native cancellation is out of scope, §14). Its promise is left to settle
  and its result is discarded by the epoch check.

The linter swallows `RunnerDisposedError` silently and, because
`onDidChangeConfiguration` already calls `triggerLintForEntireWorkspace()`
(`src/linter.ts:176`), every open document is immediately re-linted on the new
runtime. No reload, no stale diagnostics.

### 7.4 Debounce (S6)

`src/linter.ts:513-519` creates the `ThrottledDelayer` once per document and
never recreates it, and `onDidChangeConfiguration` clears `settingsByUri` and
`toolStatusByPath` but **not** `this.delayers`. So changing the delay at
construction time would not take effect on a toggle.

`Delayer.trigger` accepts a per-call delay override (`src/utils/async.ts:120-123`,
forwarded by `ThrottledDelayer.trigger` at `src/utils/async.ts:185-190`).
Use it:

```ts
const delay =
  settings.trigger === RunTrigger.onType
    ? this.runtimeManager.kind === "wasm"
      ? 750
      : 250
    : 0;
delayer.trigger(() => this.runLint(textDocument, settings), delay);
```

The delayer is still constructed with the native default so nothing else
changes.

## 8. Exit-code interpretation

| rc                          | meaning                       | wasm runner behaviour                                                                           |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 0                           | no findings                   | resolve; stdout is `{"comments":[]}`                                                            |
| 1                           | findings present              | resolve; **normal**, not an error (spike §6)                                                    |
| 2                           | input file missing/unreadable | resolve, but log stderr at `error`. In stdin mode this indicates a host-fs bug, not user error. |
| 3                           | unrecognised flag             | resolve, log stderr at `error`. Caused by a bad `shellcheck.customArgs`.                        |
| other                       | unexpected                    | resolve, log stderr at `error`                                                                  |
| host throw / `RuntimeError` | wasm trap or host bug         | reject `WasmRuntimeError` → C7                                                                  |

The linter then applies the **same** rule as today: parse `stdout` if it is
non-empty, otherwise clear diagnostics (`src/linter.ts:592-599`). The exit
code never gates parsing. This keeps native and wasm behaviourally identical
and is why no change to `parser.ts` is needed.

Silent-empty-stdout (the F3 `chdir` failure) is therefore indistinguishable
from "clean file" at the parse layer. The runner guards it explicitly: if `stdout` is empty and `stderr` mentions
`hs_init_ghc` → reject `WasmRuntimeError`, **regardless of the exit code**.
An earlier draft keyed this on `exitCode === 0`, matching one spike run;
PR 4 measured the real failure exiting 1, so that guard could never have
fired. The rc-agnostic form covers both. This is a defence-in-depth check behind the §5.1
`contains` guard, not the primary mitigation.

## 9. Failure and UX policy

### 9.1 C7 — once per session

`showShellCheckError` (`src/linter.ts:635-657`) is called from two places
(`:264` and `:569`) and has no dedupe. Add a module-level
`let wasmErrorShown = false` in the linter (session scope = extension host
lifetime; it is deliberately **not** reset by a settings toggle, so flipping
back and forth cannot spam the user):

```ts
private async showWasmRuntimeError(err: WasmRuntimeError) {
  logging.error("ShellCheck (wasm): %s\n%s", err.message, err.detail);
  if (this.wasmErrorShown) return;
  this.wasmErrorShown = true;
  const pick = await vscode.window.showErrorMessage(
    `ShellCheck (experimental WASM runtime) failed: ${err.message}`,
    "Switch back to native", "Show Log");
  if (pick === "Switch back to native") {
    await vscode.workspace.getConfiguration("shellcheck")
      .update("runtime", "native", vscode.ConfigurationTarget.Global);
  } else if (pick === "Show Log") { /* outputChannel.show() */ }
}
```

The details always reach the output channel, on every failure, regardless of
the dedupe.

### 9.2 C6 — the offer on the native ENOENT path

`src/linter.ts:641-643` currently builds `items = ["OK", "Installation Guide"]`
for `ENOENT`. Add a third item:

```ts
items = ["OK", "Installation Guide", "Try experimental WASM runtime"];
...
} else if (selected === "Try experimental WASM runtime") {
  await vscode.workspace.getConfiguration("shellcheck")
    .update("runtime", "wasm", vscode.ConfigurationTarget.Global);
}
```

Writing the setting is all it does (C6). The existing
`onDidChangeConfiguration` handler does the rest.

### 9.3 C3 — the `executablePath` notice

Emitted once per settings refresh, from `updateConfiguration`:

```ts
if (runtime === "wasm" && rawExecutablePath) {
  logging.info(
    'shellcheck.executablePath is ignored when shellcheck.runtime is "wasm".',
  );
}
```

`logging.info` only (`src/utils/logging/index.ts:38-42`). No UI.

### 9.4 Tool status in wasm mode — mandatory, easy to miss

`triggerLint` gates on
`!this.toolStatusByPath.get(settings.executable.path)!.ok`
(`src/linter.ts:492`) with a **non-null assertion**, and `runLint` reads it
again at `:529-534`, and `collectDiagnostics` at `:403`. In wasm mode C4 skips
`getToolVersion`, so nothing populates the map and `.ok` is read off
`undefined` — a TypeError on the very first lint.

Fix: in `updateConfiguration` (`src/linter.ts:251-277`), branch on the
runtime:

```ts
const statusKey =
  runtime === "wasm" ? WASM_STATUS_KEY : settings.executable.path;
if (settings.enabled && !this.toolStatusByPath.has(statusKey)) {
  if (runtime === "wasm") {
    this.toolStatusByPath.set(statusKey, {
      ok: true,
      version: WASM_TOOL_VERSION,
    });
    logging.info(`shellcheck (wasm) version: ${WASM_TOOL_VERSION}`);
  } else {
    /* existing -V probe, unchanged */
  }
}
```

with `WASM_STATUS_KEY = "\u0000wasm"` (cannot collide with a path) and
`WASM_TOOL_VERSION = semVerParse(version)` importing `version` from
`bindl.config.js` — the same import `src/utils/tool-check.ts:4` already uses.
That constant is `"0.11.0"` (`bindl.config.ts:3`), which is exactly the
version inside the pinned wasm blob (spike §1), so the two stay in lockstep by
construction.

`tryPromptForUpdatingTool` (`src/linter.ts:274`) is **not** called in wasm
mode: the artifact is bundled and the user cannot update it.

This also satisfies the requirement implied by `createParser`
(`src/parser.ts:146-159`): `json1` is selected only when
`toolVersion >= 0.7.0` (`src/parser.ts:4`). Feeding `WASM_TOOL_VERSION`
through `ToolStatus.version` (`src/linter.ts:537`) keeps the format at
`json1`, which is what the byte-identity result in spike §3 was measured
against. Passing `null` here would silently downgrade to the legacy `json`
format and break parity.

## 10. Packaging

### 10.1 Fetching the artifact

`scripts/fetch-wasm.mjs`, invoked from `prepare`:

```jsonc
"scripts": {
  "prepare": "bindl && node scripts/fetch-wasm.mjs",
  ...
}
```

Chaining after `bindl` satisfies P2: `BINDL_SKIP=true` makes `bindl` a no-op
but it still exits 0, so the wasm fetch runs on the `universal` target
(`.github/workflows/ci.yaml:98-102`) and in the `release` job
(`.github/workflows/ci.yaml:144-146`). `BINDL_CURRENT_ONLY=true`
(`.github/workflows/ci.yaml:33-35`) likewise does not affect it. The wasm
script deliberately honours **no** `BINDL_*` variable.

The script:

1. Skips the download if `wasm/shellcheck.wasm` exists **and** hashes to the
   pinned sha256. Idempotent for repeat `npm ci` and for `npm test` locally.
2. Downloads
   `https://raw.githubusercontent.com/wasilibs/go-shellcheck/<PINNED_SHA>/internal/wasm/shellcheck.wasm`
   with the commit SHA pinned, not `main`.
3. Verifies size `7650497` and sha256
   `f9d99fa45ae12d5b735425e6a32f6ea3cc550095b1e82ec1b770141470278c20`.
   Mismatch → delete the partial file and exit non-zero.
4. Downloads ShellCheck's GPLv3 `LICENSE` from
   `koalaman/shellcheck` at tag `v0.11.0` → `wasm/LICENSE.shellcheck`.
5. Writes `wasm/PROVENANCE.md`: upstream ShellCheck version (`0.11.0`, read
   from `bindl.config.ts` so it cannot drift), the go-shellcheck commit, the
   sha256, the URL, and a note that the module is built by
   `ghc-wasm-meta` from upstream ShellCheck's Haskell source (spike §5.5
   correction).

The pinned SHA, sha256 and size live as exported constants at the top of the
script so Renovate can be taught to bump them later.

### 10.2 Files

| File            | Change                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`    | add `/wasm` (next to the existing `/binaries` at `.gitignore:5`)                                                                                                                          |
| `.vscodeignore` | add `!wasm/` to the allowlist (`.vscodeignore:3-6`)                                                                                                                                       |
| `cspell.json`   | add `wasi`, `preopen`, `preopens`, `wasilibs`, `bjorn`, `prestat`, `filestat`, `fdstat`, `oflags`, `rofs`, `noent` to `words`; add `wasm/**` to `ignorePaths`                             |
| `README.md`     | extend the Disclaimer (`README.md:16-22`) with the experimental wasm runtime, and the License section (`README.md:191`) so the GPLv3 note covers the bundled wasm as well as the binaries |

P4 note: the repo's existing practice for the native binaries is a README
statement only (`README.md:191`) — `bindl` does not extract a LICENSE file
into `binaries/`. Shipping `wasm/LICENSE.shellcheck` is therefore _stricter_
than current practice, not inconsistent with it, and is the right call because
unlike the native binaries the wasm is fetched from a third-party
redistributor rather than from upstream's own release page.

### 10.3 esbuild and the Worker entry

`esbuild.js` currently has a single `entryPoints`/`outfile` pair
(`esbuild.js:9-17`). Convert to two build contexts (or one context with
`entryPoints` + `outdir`); the second one is:

```js
{
  entryPoints: ["src/runtime/wasm/worker.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "dist/wasm-worker.js",
  external: ["vscode"],           // defensive; the worker must never import vscode
  minify: production,
  sourcemap: !production,
  banner: { js: /* same createRequire banner as esbuild.js:24-27 */ },
}
```

Both contexts must be `watch()`ed / `rebuild()`ed and `dispose()`d together,
mirroring `esbuild.js:29-34`.

`@bjorn3/browser_wasi_shim` and `host-fs.ts` are bundled **into
`dist/wasm-worker.js` only**. `dist/extension.js` must not reach them — the
only wasm import on the main thread is `wasm-runner.ts`, which itself imports
`protocol.ts` (types only, erased) and nothing else from `wasm/`. Enforce with
a `check-types` pass plus a bundle-analysis assertion in PR 4's acceptance
criteria (R7: native users pay zero cost).

**Locating files at runtime.** Both paths derive from
`context.extensionUri` (P5), never `import.meta.url` or `__dirname`, which
are unreliable under a bundled, minified ESM extension host:

```ts
const workerPath = vscode.Uri.joinPath(
  ctx.extensionUri,
  "dist",
  "wasm-worker.js",
).fsPath;
const wasmPath = vscode.Uri.joinPath(
  ctx.extensionUri,
  "wasm",
  "shellcheck.wasm",
).fsPath;
```

The wasm is read on the **main thread** (R5), so the worker needs no
filesystem access to the extension directory at all.

### 10.4 Dependency

`@bjorn3/browser_wasi_shim` (`0.4.2` in the spike) goes into `dependencies`,
not `devDependencies`, because it is bundled into shipped output. Note
`posttest` runs `installed-check --ignore-dev` (`package.json:279`); the new
dependency needs an `engines`-compatible range. It has no install scripts, so
`allowScripts` (`package.json:320-324`) is unaffected.

## 11. `package.json` configuration contribution

Insert after `shellcheck.executablePath` (`package.json:129-136`):

```json
"shellcheck.runtime": {
  "order": 1,
  "markdownDescription": "**Experimental.** Which ShellCheck runtime to use.\n\n- `native` — run the bundled or user-provided `shellcheck` executable. This is the default and the only supported mode.\n- `wasm` — run a bundled WebAssembly (WASI) build of ShellCheck inside the editor. No executable is required and it works on every platform, but linting is currently about 4x slower than native, `#shellcheck.executablePath#` is ignored, and files outside the document's workspace folder are not visible to `source` directives or `.shellcheckrc` lookup.",
  "type": "string",
  "enum": [
    "native",
    "wasm"
  ],
  "enumDescriptions": [
    "Run the bundled or user-provided shellcheck executable.",
    "Run the bundled WebAssembly build of ShellCheck (experimental, slower)."
  ],
  "scope": "window",
  "default": "native",
  "tags": [
    "experimental"
  ]
}
```

`capabilities.untrustedWorkspaces` (`package.json:48-55`) is **not** extended
with `shellcheck.runtime` (C2), but its `description` at `package.json:51`
becomes inaccurate once a second runtime exists and should be reworded to,
e.g.: _"Only the user defined `shellcheck` executable will be taken into
account when running in untrusted mode. The experimental WebAssembly runtime
is sandboxed and is unaffected."_

`capabilities.virtualWorkspaces` (`package.json:56-59`) is left at `false`;
see §14.

## 12. Ordered PR breakdown

Each step is independently reviewable and leaves `master` green.

---

### PR 1 — Extract the runtime seam (pure refactor, no behaviour change)

**Files.** New: `src/runtime/types.ts`, `src/runtime/native-runner.ts`,
`src/runtime/manager.ts`. Modified: `src/linter.ts`, `src/extension.ts`.

**Changes.** Define `ShellCheckRunner`/`LintRequest`/`LintResult` (§3.1). Move
`src/linter.ts:566-616` into `NativeRunner.run()`, which resolves
`{stdout, stderr, exitCode}` and rejects with the raw error. `runLint` keeps
argv building (`:540-557`), cwd selection (`:559-564`) and
`ensureCurrentWorkingDirectory` (`:572`), then awaits the runner.
`RuntimeManager` always returns a `NativeRunner` in this PR. Instantiate it in
`activate` (`src/extension.ts:32`) and pass it to `ShellCheckProvider`.

**Acceptance.** No user-visible change. `execa` is imported only by
`native-runner.ts` and `tool-check.ts`. `src/linter.ts` has no `execa` import
(it has one today at `src/linter.ts:1`).

**Verify.** `npm run build:all && npm test` on all three OSes, unchanged.

---

### PR 2 — Fetch, verify and package the wasm artifact

**Files.** New: `scripts/fetch-wasm.mjs`. Modified: `package.json` (scripts),
`.gitignore`, `.vscodeignore`, `cspell.json`, `README.md`.

**Changes.** §10.1, §10.2. No extension code reads the artifact yet.

**Acceptance.**

- `npm ci` produces `wasm/shellcheck.wasm` with the pinned sha256, plus
  `wasm/LICENSE.shellcheck` and `wasm/PROVENANCE.md`.
- `BINDL_SKIP=true npm ci` still produces all three (P2).
- `BINDL_CURRENT_ONLY=true npm ci` still produces all three.
- A corrupted `wasm/shellcheck.wasm` causes `npm ci` to fail loudly.
- `npx vsce ls` lists `wasm/shellcheck.wasm` for a platform target and for
  `universal` (P3).

**Verify.** Run the three `npm ci` variants locally; download one CI artifact
per target from the `build` matrix and `unzip -l` it.

---

### PR 3 — WASI host: path translation and the read-only preopen

**Files.** New: `src/runtime/wasm/wasi-host.ts`,
`src/runtime/wasm/host-fs.ts`, `src/runtime/wasm/guest-path.ts`,
`test/guest-path.test.ts`, `test/host-fs.test.ts`, plus a fixture tree under
`test/fixtures/wasi-host/` — deliberately **separate** from PR 7's
`test/fixtures/wasm-parity/`, see the note under PR 7.

**Changes.** §5, §6. `createShimWasiHost()` is exercised directly by the tests
against `wasm/shellcheck.wasm`; no VS Code, no Worker yet.

**Acceptance.**

- `toGuest`/`fromGuest` round-trip; `..` escape, absolute-path escape and
  (on win32) `\`-in-guest-path are all rejected.
- A symlink inside the root pointing outside is rejected (§6.1 item 3).
- Running the fixture through `WasiHost.run` with `preopen {'/': fixtureRoot}`
  and `env.PWD = '/sub'` produces output **byte-identical** to
  `shellcheck -f json1 -s bash -` run with `cwd = fixtureRoot/sub`
  (reproduces spike §4(c) `qb-verify.mjs`).
- Omitting `PWD` reproduces the SC1091 + SC2034 divergence, proving the
  fixture actually tests rc/source resolution.
- No fd growth: `/proc/self/fd` (or `lsof`) count is identical before and
  after 200 runs on Linux.

**Verify.** These tests run under `@vscode/test-cli` like the rest, but touch
no `vscode` API beyond nothing at all, so they are fast.

---

### PR 4 — Worker, protocol, scheduling, cancellation

**Files.** New: `src/runtime/wasm/protocol.ts`,
`src/runtime/wasm/worker.ts`, `src/runtime/wasm/wasm-runner.ts`,
`src/runtime/wasm/version.ts`. Modified: `esbuild.js`, `package.json`
(dependency).

**Changes.** §7, §10.3, §10.4. `WasmRunner` implements `ShellCheckRunner`
but is not yet reachable from settings.

**Acceptance.**

- `dist/wasm-worker.js` is emitted and contains `browser_wasi_shim`;
  `dist/extension.js` does **not**.
- Worker ready in ~120 ms; a second `run()` on the same worker uses a fresh
  `Instance` (R6) and succeeds — i.e. no `RuntimeError: unreachable`.
- Superseding a document's in-flight run terminates and respawns; the
  superseded promise rejects with `RunSupersededError`; the next result is
  correct.
- A request for a _different_ document queues rather than terminating (S4).
- Watchdog: an artificially lowered timeout terminates the run and rejects
  with `WasmRuntimeError`.
- `dispose()` during an in-flight run rejects with `RunnerDisposedError` and
  leaves no live worker (`process._getActiveHandles()` clean).

**Verify.** Headless tests driving `WasmRunner` directly.

---

### PR 5 — The `shellcheck.runtime` setting and wiring

**Files.** Modified: `package.json` (configuration, capabilities description),
`src/settings.ts`, `src/runtime/manager.ts`, `src/linter.ts`.

**Changes.**

- `package.json`: the §11 snippet; reword `capabilities.untrustedWorkspaces.description`.
- `src/settings.ts`: add `runtime: "runtime"` to `ShellCheckSettings.keys`
  (`src/settings.ts:24-34`) — **required**, otherwise
  `checkIfConfigurationChanged` (`src/settings.ts:100-110`) never fires for
  the new key and R8 silently does not work. Add `runtime: RuntimeKind` to
  the `ShellCheckSettings` interface. Skip the `getExecutable` call
  (`src/settings.ts:74`) in wasm mode and substitute
  `{ path: "", bundled: false }` so no `fs.access` happens (C3, R7).
- `src/linter.ts`: §9.4 tool-status branch; §7.4 per-call debounce.
- `RuntimeManager.refresh()` wired into `onDidChangeConfiguration`
  (`src/linter.ts:167-177`).

**Acceptance.**

- Setting `shellcheck.runtime = "wasm"` lints correctly with **no reload**;
  setting it back restores native, also with no reload (R8).
- With `runtime = "native"`, no Worker is created and `wasm/shellcheck.wasm`
  is never opened (verify with `strace -f -e openat` on Linux, or a temporary
  instrumented build).
- The setting is editable and effective in an untrusted workspace (C2).
- Output channel shows `shellcheck (wasm) version: 0.11.0` and the format is
  `json1`.

---

### PR 6 — Failure and UX policy

**Files.** Modified: `src/linter.ts`.

**Changes.** §9.1, §9.2, §9.3.

**Acceptance.**

- Point `shellcheck.executablePath` at a nonexistent file in native mode →
  the error offers **"Try experimental WASM runtime"**; clicking it writes
  `shellcheck.runtime = "wasm"` at Global scope and lints start working (C6).
- Corrupt `wasm/shellcheck.wasm` → exactly one error message per session with
  **"Switch back to native"**; repeated lints add output-channel lines but no
  further popups (C7). Clicking it writes `runtime = "native"` at Global scope.
- No automatic fallback happens in either direction (C7).
- In wasm mode with `executablePath` set, exactly one `info` line appears (C3).

---

### PR 7 — Parameterised tests, parity fixtures, CI

**Files.** Modified: `test/extension.test.ts`, `test/fix-all.test.ts`,
`test/helpers.ts`, `.vscode-test.js`, `.github/workflows/ci.yaml`.
New: `test/parity.test.ts`, `test/fixtures/wasm-parity/**`.

**Changes.**

- `test/helpers.ts`: add `withRuntime(kind, fn)` which sets
  `shellcheck.runtime` at Global scope, waits for the config-change round
  trip, runs `fn`, and restores.
- Wrap the two suites in `test/extension.test.ts:9` and
  `test/fix-all.test.ts:10` in `for (const runtime of ["native", "wasm"])`
  (T1).
- `test/parity.test.ts`: for each of the three fixtures (T2), run the document
  under both runtimes and `assert.deepStrictEqual` the normalised diagnostics
  (range, severity, code value, message, tags).
- `.vscode-test.js` currently opens **no** workspace folder
  (`.vscode-test.js:3-11`). Add `workspaceFolder: "test/fixtures/wasm-parity"`
  — without it the parity fixtures cannot exist, because
  `getWorkspaceFolderPath` returns `undefined` and the wasm path gets no
  preopen at all (§13 O-1).
- `mocha.timeout` is 10 s (`.vscode-test.js:9`). wasm cold start (~120 ms)
  plus a ~4x slower lint is still well inside it for small fixtures, but the
  parity suite should set a per-suite timeout of 30 s for headroom.
- CI: no matrix change is needed for T3 — the `test` job already runs
  ubuntu/windows/macos (`.github/workflows/ci.yaml:22`). The only change is
  ensuring `npm ci` in that job produces the wasm (PR 2 already guarantees
  this, since the job sets only `BINDL_CURRENT_ONLY`).

> **Fixture trees are separate on purpose.** PR 3's host-level fixture lives
> in `test/fixtures/wasi-host/` and puts `.shellcheckrc` in the _same_
> directory as the script. That is forced: PR 3's "omitting `PWD` reproduces
> the SC1091 + SC2034 divergence" check only works if the rc is unreachable
> from the guest cwd `/`, and an rc at the preopen root is found from `/`
> (verified against the native binary). The consequence is that PR 3 does
> **not** cover parent-directory rc discovery, so **T2(b) below is the only
> coverage of requirement F2's upward `.shellcheckrc` walk** — it must not be
> dropped or merged into PR 3's tree.

**Fixtures (T2).**

```
test/fixtures/wasm-parity/
  .shellcheckrc            disable=SC2034
                           external-sources=true
  lib/util.sh              UTIL_HOME=/tmp ; util_greet() { echo "hi $1"; }
  plain/plain.sh           #!/bin/bash
                           echo $FOO            # SC2086, no rc influence
  rc/child/uses-rc.sh      #!/bin/bash
                           unused=1             # SC2034, suppressed only via parent rc
                           echo $unused         # SC2086
  src/sources.sh           #!/bin/bash
                           # shellcheck source=../lib/util.sh
                           source ../lib/util.sh
                           util_greet $1        # SC2086; SC1091 iff source not followed
```

`rc/child/uses-rc.sh` is deliberately two directory levels below the
`.shellcheckrc` so it proves the **upward walk**, which is the thing `-P`
cannot do (F2). `src/sources.sh` is run with
`shellcheck.customArgs: ["-x"]` for the external-sources case.

**Acceptance.** All suites pass on all three OSes under both runtimes; the
parity suite fails if `PWD` is dropped from the wasm path (assert this once by
temporarily removing it locally).

---

### PR 8 — Documentation

**Files.** Modified: `README.md`.

**Changes.** A short "Experimental WebAssembly runtime" section: what it is,
how to enable it, the F5 limitation, the ~4x cost, and that it is unsupported.
Extend the License section (`README.md:191`) to cover the bundled wasm.
`CHANGELOG.md` is generated by semantic-release (`common.release.config.js:65`)
— do not edit it; use a `feat:` commit subject.

---

## 13. Risks and open implementation questions

These are **not** answered by the settled decisions.

### Open questions

All but one of the first draft's open questions were settled and moved to
§2.7. What remains is a measurement, not a decision:

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Which Node version does the extension host actually use at runtime? `mise.toml` pins Node 24.21.0 for _tooling_, but the extension runs on VS Code's bundled Node (20.x/22.x at `engines.vscode: ^1.100.0`; Node 24 from VS Code 1.123). The spike measured the command build **13-14% slower on Node 24 than on Node 22** (§5.2), so the user-visible ratio depends on a version we do not control. Measure once inside a real extension host before quoting any number in the README. |

### Risks

| #   | Risk                                                                                                                                                                                                                                                                                                                                                                                   | Mitigation                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | **Extension-host crash.** The soak report (exp 7b) shows a native-level fault inside a Worker kills the _whole process_, observed as exit 139 rather than a Worker `error` event. That was `node:wasi` on Node 22, which we do not use — but it establishes that Worker threads give no crash isolation, so a bug in the shim or in V8's wasm engine can take the extension host down. | Unavoidable architecturally. Mitigated by: opt-in only; no auto-respawn on unexpected exit (§7.3); experimental labelling.                                                                |
| R-2 | **Perceived slowness.** ~4x native, and the gap widens with file size (spike §7). With `run: onType` (the default, `package.json:146`) a 1500-line script would re-lint every 750 ms at ~4.3 s per run, so the Worker is permanently saturated and every keystroke triggers a terminate+respawn.                                                                                       | The S3 terminate-on-supersede design is exactly what keeps this from queueing unboundedly. Consider recommending `run: onSave` in the README's wasm section.                              |
| R-3 | **Sandbox escape via symlink.** The prototype's containment check is textual (`lib-shim-fs.mjs:65-68`), so a symlink inside the workspace to `/etc/shadow` is followed. This directly undermines the C2 justification for allowing wasm mode in untrusted workspaces.                                                                                                                  | §6.1 item 3 (`fs.realpathSync.native` containment) is mandatory, not optional, and must be covered by a PR 3 test.                                                                        |
| R-4 | **Memory.** 125-160 MiB RSS while linting (spike §5.7), on top of the extension host. A fresh `Instance` per lint (R6) re-allocates linear memory each time; the shim host measured the lower figure (124.6 MiB) which is one reason it is preferred.                                                                                                                                  | Accept; document in the README. No pooling (R9).                                                                                                                                          |
| R-5 | **`customArgs` that assume a real filesystem.** Users passing `-P /abs/path` or `--source-path=...` with host-absolute paths will silently not resolve, because those paths are not guest paths. `substitutePath` (`src/settings.ts:77`) expands `${workspaceFolder}` into a _host_ path.                                                                                              | Settled as C9 (§2.7): pass through verbatim, warn on host-absolute paths, never rewrite. README limitation.                                                                               |
| R-6 | **Case sensitivity.** shellcheck compares guest paths case-sensitively; NTFS and APFS do not. A `# shellcheck source=Lib/Util.sh` that works natively on macOS may behave differently through our mapping (spike §4(e)).                                                                                                                                                               | Low impact, document only.                                                                                                                                                                |
| R-7 | **`structuredClone` of `WebAssembly.Module` across a Worker boundary** is measured working on Node 22/24 (spike §5.4/C4b) but is not formally guaranteed by the WebAssembly JS API for all hosts.                                                                                                                                                                                      | If it ever fails, fall back to posting the bytes and recompiling in the worker (+40-48 ms per respawn, spike §5.4/D). Detect by catching the `postMessage` DataCloneError at `init` time. |
| R-8 | **Bundle size.** `dist/extension.js` must not grow; `dist/wasm-worker.js` adds the shim (~tens of KB). The 7.65 MB raw wasm compresses to ~1.68 MiB in the VSIX — roughly a third of one native binary, so platform VSIXes grow modestly and `universal` grows from near-nothing to ~1.7 MiB.                                                                                          | Acceptable per P3. Worth stating in the PR 2 description.                                                                                                                                 |

## 14. Future work

1. **Fork / own the wasm build — also the main performance lever.**
   `wasilibs/go-shellcheck` pins `ghc-wasm-meta` to a commit that predates
   GHC's use of wasm **tail calls**. V8 has shipped tail calls; a GHC wasm
   backend that emits them removes a large share of the trampolining overhead
   that dominates `_start` (spike §5.2 shows the cost is compute inside
   `_start`, not I/O — the WASI host choice moves it by <3%). Building our own
   artifact from upstream ShellCheck's Haskell source with a current
   `ghc-wasm-meta` is the single highest-leverage change available, and it
   also removes the third-party redistribution link in the supply chain.
2. **Native-path cancellation.** Today the native path never kills an
   in-flight `shellcheck` child (`src/linter.ts:576`); the `ThrottledDelayer`
   only collapses _pending_ requests. The `ShellCheckRunner` seam from PR 1
   makes it straightforward to add an `AbortSignal` to `LintRequest` and pass
   it to `execa`, giving both runtimes the same S2/S3 semantics.
3. **Web support (#478).** Requires (a) swapping `createShimWasiHost()` for a
   backend over `vscode.workspace.fs` (async — which means either an
   `Atomics.wait`-based sync bridge in the worker, or pre-reading the
   reachable file set), (b) a web extension bundle
   (`browser` entry in `package.json`), and (c) flipping
   `capabilities.virtualWorkspaces.supported` (`package.json:56-59`). The
   `WasiHost` interface (§3.2) is the entire seam this work has to land
   behind.
4. **Bar for graduating out of experimental.** All of:
   - **≤2-3x native** median latency on a representative script corpus (today
     3.9-4.4x; item 1 is the path there).
   - No crash or fd-leak regression over a 10,000-run soak on the Node version
     VS Code actually ships (soak report methodology, exp 1-5).
   - Parity fixtures (T2) green on all three OSes for two consecutive
     releases.
   - The F5 limitation either removed or explicitly accepted as permanent,
     with a documented behaviour for files outside the workspace folder.
   - The symlink-containment guard (R-3) reviewed as a security boundary, not
     just a correctness fix, if wasm mode is ever to become the default in
     untrusted workspaces.
