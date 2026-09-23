# WebAssembly runtime over `workspace.fs`

Supersedes the filesystem, packaging and scheduling parts of
[`wasm-runtime.md`](./wasm-runtime.md) (#1952). Everything that document
settles about configuration, failure UX, parity testing and GPL aggregation
still holds unless it is contradicted here.

## 1. What changed and why

#1952 ran the guest in a worker that read files with `node:fs`, through a
read-only preopen rooted at a host path. That only works for `file:`
documents on a machine with a local disk, and never in a browser. The
runtime now consumes `@vscode-shellcheck/shellcheck-wasm` 0.2, whose runner
reads files only through a `ShellCheckFileSystem` the host passes per lint
(package ADR 0006). The extension implements it over `vscode.workspace.fs`,
for every scheme including `file:`, so there is one code path.

The wasm path uses no `node:fs`, `node:path` or `process.platform`. The only
Node API left on it is `node:worker_threads`: in the five-line worker entry
(`src/runtime/wasm/worker.ts`, which only calls the package's `startWorker`)
and where the main thread constructs that worker.

## 2. Decisions

### 2.1 Not `ms-vscode.wasm-wasi-core`

Rejected for the reasons in package ADR 0006: dormant since 2024, no custom
imports, no read-only mount, every syscall serviced on the extension host's
main thread, and a hard dependency on another extension. The package's own
bridge (the guest blocks in `Atomics.wait` on a `SharedArrayBuffer` while the
host's thread answers) covers the three read operations ShellCheck needs.

### 2.2 Files through `workspace.fs`

`src/runtime/wasm/workspace-fs.ts` maps a guest path to
`Uri.joinPath(mountRoot, ...segments)`. `vscode.FileType` loses its
`SymbolicLink` bit, then `File` becomes `"file"`, `Directory` `"directory"`,
anything else `"other"`. A `vscode.FileSystemError` whose code the package
knows (`FileNotFound`, `FileNotADirectory`, `FileIsADirectory`,
`NoPermissions`, `Unavailable`) is passed on under that code; anything else
is rethrown and reaches the guest as `EIO`. A guest path containing `..` is
refused even though the package already normalizes it, because
`Uri.joinPath` would resolve it.

The module itself is read the same way:
`workspace.fs.readFile(extensionUri/node_modules/@vscode-shellcheck/shellcheck-wasm/dist/shellcheck.wasm)`,
compiled once with `WebAssembly.compile` and handed to the package, which
posts the same `Module` to every worker it starts. #1952 had a fallback that
posted the bytes instead if a host refused to structured-clone a `Module`
(`DataCloneError`). It was defensive only: plan risk R-7 noted that cloning a
`Module` is measured on Node 22/24 but not guaranteed by the JS API, and no
host was ever seen to refuse it. The fallback is gone with the extension's
own protocol; the integration tests exercise the `Module` path in the real
Electron extension host.

The version shown in the output channel and in _Collect Diagnostics_ comes
from the package's `SHELLCHECK_VERSION` and `BUILD_INFO`, imported on demand;
`build-info.json` is no longer read.

### 2.3 Mount policy

The same for every scheme (`src/runtime/wasm/guest-path.ts`):

| Document                  | Mounted at guest `/`               | `PWD`                                                                  |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| inside a workspace folder | that folder (`getWorkspaceFolder`) | the document's directory; `/` under `shellcheck.useWorkspaceRootAsCwd` |
| outside every folder      | the document's directory           | `/`                                                                    |
| `untitled:`               | nothing, stdin only                | unset                                                                  |

`PWD` is computed on `Uri.path`, which is POSIX for every scheme, so the
win32 host-to-guest mapping of #1952 is gone. Before a lint the working
directory is `stat`ed through `workspace.fs`, as `ensureCurrentWorkingDirectory`
does for the native runtime; if it is not a readable directory (a scheme
nobody serves, a deleted directory) the lint runs on stdin alone instead of
failing the guest's `chdir`. #1952's rule that non-`file:` documents run
without any files is dropped: they are now mounted like any other.

### 2.4 Symlinks are not contained

The `node:fs` preopen of #1952 refused symlinks leading out of the mount
with `realpath` checks. `workspace.fs` has no realpath, and whether a link is
followed is the file system provider's decision; the adapter follows
whatever the provider follows. Accepted: the guest can still only read, and
only through the same API every other extension uses.

### 2.5 Scheduling stays in the extension

The package runs one lint at a time in call order and aborts on an
`AbortSignal` (terminating its worker if the lint is running; the next lint
starts a new one). `WasmRunner` (`src/runtime/wasm/wasm-runner.ts`) keeps the
policy:

- One lint submitted to the package at a time; everything else waits in a
  map keyed by document URI.
- Latest only: a newer request replaces the pending one of its document
  (which keeps its place in line); if that document's lint is running, it
  is aborted with `RunSupersededError`.
- Next pick: the document of `window.activeTextEditor` if it is pending,
  otherwise first in, first out.
- Watchdog: `AbortSignal.any([perLintController, AbortSignal.timeout(30 s)])`,
  hard-coded. A timeout is a `WasmRuntimeError` and uses the existing
  once-per-session notification with _Switch back to native_.
- A lost worker or a guest trap rejects only that lint as a
  `WasmRuntimeError`; the package starts a fresh worker for the next one.
- `dispose()` (runtime switch, deactivation) rejects everything with
  `RunnerDisposedError`, aborts the running lint and disposes the package
  instance.

The `onType` debounce (750 ms for wasm) and the failure UX are unchanged.

### 2.6 Which documents are linted

`shellcheck.ignoreFileSchemes` (default `git`, `gitfs`, `output`) still
applies to both runtimes: those exclusions exist for diff views and output
channels, not for lack of a file system. In wasm mode every other scheme is
linted with the mount above. The native runtime keeps linting what it did,
with one exception for virtual workspaces below.

### 2.7 Virtual workspaces

`capabilities.virtualWorkspaces.supported` is `"limited"`. In a virtual
workspace (every workspace folder non-`file:`) with `runtime` `native`, a
document that is neither `file:` nor `untitled:` is skipped without probing
or spawning the program, with one `info` line in the output channel and a
warning in _Collect Diagnostics_. No new prompt. Untrusted workspaces behave
as in #1952: the wasm runtime is allowed.

## 3. Follow-ups

- **VS Code for the Web.** Needs a `browser` entry, a web worker entry
  (`onMessage` unwraps `MessageEvent.data`), and a cross-origin-isolated
  page, because browsers only provide `SharedArrayBuffer` there. Loading the
  module with `WebAssembly.compileStreaming` is optional.
- **The JSFFI reactor build** was rejected for #1952 (different `fix` schema,
  no rc discovery). On the web it would avoid the worker and the
  `SharedArrayBuffer` requirement, so it is worth re-evaluating there.
- Native-path cancellation remains a separate item.
