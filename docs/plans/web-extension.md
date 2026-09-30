# ShellCheck in VS Code for the Web (#478)

Builds on [`wasm-runtime-workspace-fs.md`](./wasm-runtime-workspace-fs.md):
the wasm runtime already reads every file through `workspace.fs` and the
package's runner uses no `node:*` module. What is missing is a `browser`
entry, a web Worker, and keeping every Node-only module out of that entry.

## 1. Facts this plan rests on

Measured 2026-09-29 with a throwaway extension under `@vscode/test-web`
0.0.81 (VS Code Web 1.140.0-insider, Chrome 153):

- With `--coi`, the web extension host worker has `crossOriginIsolated ===
true`; `SharedArrayBuffer`, a nested
  `new Worker(Uri.joinPath(extensionUri, "…/worker.js").toString(true))`
  (classic IIFE script), `workspace.fs.readFile` of the packaged `.wasm` and
  `WebAssembly.compile` all work. A lint through the package's bridge reads
  `/.shellcheckrc` and follows `source`, with output identical to the desktop
  wasm runtime. Compile ~50–80 ms, a small lint ~80 ms.
- Without `--coi`: `ReferenceError: SharedArrayBuffer is not defined`.
- vscode.dev, insiders.vscode.dev and github.dev serve COOP `same-origin` +
  COEP `require-corp` today, so they are cross-origin isolated by default.
  Self-hosted servers (code-server, `code serve-web`) are unverified.
- A web extension's `browser` entry must be one CommonJS file; the web
  extension host has no ESM loader. In a `"type": "module"` package it must
  end in `.cjs`, or VS Code tries to load it as ESM.
- The package's `index.js` evaluates
  `new URL("./shellcheck.wasm", import.meta.url)` at load. In a CommonJS
  bundle `import.meta.url` is undefined and the module throws `Invalid URL`
  as soon as it is required.
- The module uses tail calls: the oldest Safari that can compile it is 18.2.

## 2. Decisions (settled with Timon, 2026-09-29)

1. **Licensing.** The package's host-side client (`createShellCheck`, the
   bridge protocol, the file-system types and the generated version
   constants) becomes MIT, so it may be bundled into the MIT web entry. The
   guest side (`worker`, `runner`, `preopen`, `fds`, `bridge`, the `.wasm`)
   stays GPL-3.0-or-later and is never bundled into an extension file.
2. **The web worker script is built by the package**, as a self-contained
   classic script at `dist/browser/worker.js`. The extension starts it from
   its `node_modules` copy, which the VSIX already ships.
3. **No cross-origin isolation → error, no fallback.** No JSPI, no reactor
   build.
4. **No performance gate on the web.** There is no native runtime to
   compare with.

Derived from these:

- On the web the runtime is always wasm; `shellcheck.runtime` and
  `shellcheck.executablePath` are ignored there.
- No "Switch back to native" or "Try experimental WASM runtime" item is
  ever offered on the web.

## 3. Package: `@vscode-shellcheck/shellcheck-wasm` 0.2.0-next.1

Repository `vscode-shellcheck/shellcheck-wasm`, branch
`feat/browser-client-and-worker`.

### 3.1 `./client` entry (MIT)

- New source `src/client-entry.ts`, built to `dist/client-entry.js`, which
  re-exports exactly: `createShellCheck` and its types (`ShellCheck`,
  `ShellCheckOptions`, `LintRequest`, `LintResult`, `LintOptions`,
  `WorkerPort`), the file-system types (`ShellCheckFileSystem`, `FileStat`,
  `FileType`, `FileSystemErrorCode`), `BuildInfo`, `BUILD_INFO` and
  `SHELLCHECK_VERSION`.
- It must not reference `import.meta`, nor import (even transitively) any
  guest-side module. A vitest test bundles `dist/client-entry.js` with
  esbuild and fails on any input without the MIT SPDX identifier.
- `package.json` `exports` gains
  `"./client": { "types": "./dist/client-entry.d.ts", "default": "./dist/client-entry.js" }`.
  `"."` stays as it is (still exports `wasmUrl`) so 0.2.0-next.0 consumers
  keep working.
- Licensing: every file behind `./client` (`client-entry`, `client`,
  `protocol`, `file-system`, `build-info` types, `generated/*`) gets
  `// SPDX-License-Identifier: MIT`; every other source gets
  `// SPDX-License-Identifier: GPL-3.0-or-later`. Add `LICENSE-MIT`. Set
  `"license": "GPL-3.0-or-later AND MIT"`. The README gets a "Licensing"
  section naming which entry is under which license. Add the next free-numbered ADR "Host-side
  client is MIT", amending ADR 0001.

### 3.2 `./browser/worker.js` (GPL)

- New source `src/browser-worker.ts`:
  ```ts
  import { startWorker } from "./worker.js";
  startWorker({
    postMessage: (message) => self.postMessage(message),
    onMessage: (listener) =>
      self.addEventListener("message", (event) => listener(event.data)),
  });
  ```
- Built with esbuild (new devDependency) to `dist/browser/worker.js`:
  `bundle: true, format: "iife", platform: "browser", target: "es2022"`,
  `@bjorn3/browser_wasi_shim` bundled in. Keep a
  `/*! SPDX-License-Identifier: GPL-3.0-or-later */` banner plus the shim's
  license comment (`legalComments: "inline"`).
- `exports` gains `"./browser/worker.js": "./dist/browser/worker.js"`.
- Test: the built file contains no `import`/`export` statement and no
  `import.meta`, and the existing worker tests still pass under Node.

### 3.3 Release

Timon merges and tags `v0.2.0-next.1`, which publishes to the npm `next`
dist-tag. Nothing is published from an agent session.

## 4. Extension

Branch `feat/web-extension`.

### 4.1 Web twins

A module `x.ts` may have a twin `x.web.ts`. The web build resolves every
relative import of `x.js` to the twin where one exists (`webTwinPlugin` in
`esbuild.js`); the Node builds never see twins. Two modules have one:

- `src/runtime/native.ts` exports `nativeRuntime: NativeRuntime | undefined`,
  everything that runs a shellcheck program: resolving the executable, the
  `-V` probe and update prompt, the working directory, and the runner. Its
  web twin exports `undefined`. The type forces every native call site to
  face the web; they are all behind `runtime === "native"`, which
  `getRuntimeKind` (`settings.ts`) never returns without a native runtime, so
  they use `nativeRuntime!`. The Node-only helpers that were in `settings.ts`
  and `utils/path.ts` moved into `native.ts` unchanged; `utils/tool-check.ts`
  is unchanged and only reachable from there.
- `src/platform/index.ts` holds what differs between a Node and a browser
  host for code both builds share: `isWindows`, `homeDirectory` (web:
  `undefined`, so `${userHome}` is left as is), `formatLogMessage`
  (`util.format`; web: a small formatter), `startWasmWorker`
  (`worker_threads` on `dist/wasm-worker.js`; web: `new Worker` on the
  package's `dist/browser/worker.js` URL) and `assertWasmHostSupported` (web:
  throws a `WasmRuntimeError` unless `crossOriginIsolated`). The web twin
  carries a type that fails `tsc` when the two export different things.

Rules:

- With `platform: "browser"`, esbuild fails on any `node:*` import that
  reaches the web graph, so a Node module cannot slip in unnoticed.
- `gplGuardPlugin` fails the web build on any import of the package other
  than `@vscode-shellcheck/shellcheck-wasm/client`. A desktop test also
  checks that `dist/web/extension.cjs` contains no WASI shim.
- Every import of the package's host API uses `…/client`, on both builds.
- `linter.ts` reads the `.bash`/`.ksh`/`.dash` dialect off `Uri.path`
  (`utils/shell-dialect.ts`) instead of `node:path`.

### 4.2 Runtime selection on the web

- `getRuntimeKind` returns `"wasm"` whenever `nativeRuntime` is undefined,
  whatever `shellcheck.runtime` says; `RuntimeManager` and
  `getWorkspaceSettings` both use it. The manifest says so; nothing is
  logged.
- `RuntimeManager.create("wasm")` calls `assertWasmHostSupported()` first,
  which on the web requires cross-origin isolation and the package's
  `isArtifactSupported()` (wasm tail calls and SIMD: no Safari before 18.2,
  no Firefox ESR 115); its error takes the existing wasm failure path.
- `WasmFailureNotifier(canSwitchToNative)` offers `[showLog]` only where
  there is no native runtime.

### 4.3 Build and manifest

A third esbuild context bundles `src/extension.ts` to `dist/web/extension.cjs`
(`format: "cjs"`, `platform: "browser"`, `external: ["vscode"]`, no
`createRequire` banner). `package.json` gets
`"browser": "./dist/web/extension.cjs"`: the package is `"type": "module"`, so
VS Code would load a `.js` entry, and the web suite's `.js` bundle, as ESM,
which the web extension host refuses. `.vscodeignore` is unchanged. The
manifest's `virtualWorkspaces` and `shellcheck.runtime` descriptions and a
README section describe the web.

### 4.4 Tests

- Desktop: `test/platform.web.test.ts` (the web formatter, and the
  cross-origin check, which the desktop host fails like a non-isolated page),
  `test/shell-dialect.test.ts`, a failure-UX case, and the web bundle GPL
  check. Everything else stays as it is.
- Web E2E (`test/web/`), run by `@vscode/test-web` in headless Chromium with
  `--coi`, on `test/fixtures/wasm-parity`: the desktop parity fixtures
  (`test/parity-fixtures.ts`, shared with `parity.test.ts`) must produce
  exactly their expected findings, with `shellcheck.runtime` set to
  `native`; and an untitled document is linted as it is typed. The suite
  bundle goes to `out/web-test/`, never into the VSIX.
- Artifact: `@vscode/test-web` keeps workspace writes in memory, so the suite
  prints its normalized diagnostics on one marked console line and
  `test/web/run.mjs` saves them to `out/web-e2e/diagnostics.json`. Two runs
  must produce identical files.
- `npm run build:test:web && npm run test:web`; not part of `npm test`. CI
  runs it in a `test-web` job on `ubuntu-latest`, which the release job
  needs.

### 4.5 Out of scope

Firefox and WebKit runs; self-hosted COI detection beyond the error;
performance work; `code serve-web` verification.

## 5. Order

1. Package §3: vscode-shellcheck/shellcheck-wasm#23; Timon merges and
   publishes 0.2.0-next.1.
2. Extension §4 is built and tested against a local `npm pack` of that
   branch; its dependency moves to `0.2.0-next.1` once that is on npm, before
   the PR leaves draft.
