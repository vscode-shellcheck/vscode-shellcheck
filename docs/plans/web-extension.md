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
  extension host has no ESM loader.
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

- On the web the runtime is always wasm. `shellcheck.runtime` and
  `shellcheck.executablePath` are ignored there (logged once, as
  `executablePath` already is under wasm).
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
  guest-side module. A vitest test asserts both by reading the built
  `dist/client-entry.js` and every file it imports.
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

### 4.1 Platform seam

One module with two implementations, chosen at build time:

- `src/platform/index.ts` — Node (desktop, remote).
- `src/platform/index.web.ts` — web. Its first line is a type-level check that
  it exports the same surface:
  `import type * as NodePlatform from "./index.js";` plus a
  `satisfies`/assignment check over every export, so `tsc` fails when the two
  drift.
- `esbuild.js` gets a web-only plugin that resolves any import of
  `./platform/index.js` (relative, from anywhere under `src/`) to
  `src/platform/index.web.ts`.

Exports (Node behavior is today's behavior, moved, not changed):

| Export | Node | Web |
| --- | --- | --- |
| `isWeb: boolean` | `false` | `true` |
| `formatLogMessage(format, ...args): string` | `util.format` | small `%s %d %i %f %j %o %O %%` formatter; `%o`/`%O` JSON-stringify objects, an `Error` becomes its `stack ?? message` |
| `resolveExecutable(context, configuredPath)` | today's `getExecutable` from `settings.ts` | never called (see 4.2); returns `{ path: "", bundled: false }` |
| `getToolVersion(path)` | today's, from `tool-check.ts` | rejects; never called |
| `tryPromptForUpdatingTool(version)` | today's, from `tool-check.ts` | no-op; never called. It must move behind the seam because `tool-check.ts` imports `bindl.config.ts`, which imports the Node-only `bindl` package |
| `createNativeRunner(): ShellCheckRunner` | `new NativeRunner()` | throws; never called |
| `homeDirectory(): string \| undefined` | `os.homedir()` with drive-casing fix | `undefined`: `${userHome}` is left unsubstituted |
| `nativeWorkingDirectory(...)` helpers: `guessDocumentDirname`, `ensureCurrentWorkingDirectory` | today's, from `utils/path.ts` | never called; return `undefined` |
| `startWasmWorker(extensionUri, logger): WorkerPort` | today's `startWorker` from `packaged.ts` (worker_threads, `dist/wasm-worker.js`) | `new Worker(Uri.joinPath(extensionUri, "node_modules/@vscode-shellcheck/shellcheck-wasm/dist/browser/worker.js").toString(true))`; `onMessage` unwraps `event.data`; `onError` passes `event.message ?? event`; no `onExit` |
| `assertWasmHostSupported(): void` | no-op | throws `WasmRuntimeError("ShellCheck needs a cross-origin isolated VS Code for the Web: SharedArrayBuffer is unavailable")` unless `globalThis.crossOriginIsolated === true` |

Rules:

- After the refactor, no file outside `src/platform/index.ts`,
  `src/runtime/native-runner.ts` and `src/runtime/wasm/worker.ts` imports
  `node:*`, `execa` or `@vscode-shellcheck/shellcheck-wasm` (root) /
  `…/worker`. The web build enforces this for free: with
  `platform: "browser"` esbuild fails to resolve `node:*`. Add an esbuild
  `onResolve` guard in the web build that fails on
  `@vscode-shellcheck/shellcheck-wasm` and `…/worker` (only `…/client` is
  allowed), so a GPL module can never land in `dist/web/extension.js`.
- `linter.ts`: `extname(textDocument.fileName)` becomes the extension of the
  last segment of `textDocument.uri.path` (POSIX for every scheme). Keep the
  `.bash`/`.ksh`/`.dash` behavior; add a unit test for a Windows `file:` URI
  and a `vscode-vfs:` URI.
- Both desktop and web import the package's host API from
  `@vscode-shellcheck/shellcheck-wasm/client` (types included). On desktop
  it stays `external` and dynamically imported; on the web it is bundled.

### 4.2 Runtime selection on the web

- `RuntimeManager.getRuntimeKind` and `getWorkspaceSettings` both return
  `"wasm"` when `platform.isWeb`, whatever `shellcheck.runtime` says. On the
  web, a configured `shellcheck.runtime: "native"` is logged once at info
  level: `shellcheck.runtime is ignored in VS Code for the Web, which only has the wasm runtime`.
- `RuntimeManager.create("wasm")` calls `platform.assertWasmHostSupported()`
  first. Its `WasmRuntimeError` goes through the existing wasm failure path
  (one notification, details logged).
- `failure-ux.ts`: `describeWasmFailure(error, { canSwitchToNative })`.
  Items are `[switchBackToNative, showLog]` when true (desktop, unchanged)
  and `[showLog]` on the web. `describeShellCheckError` is unreachable on the
  web; leave it.
- `isOutOfNativeReach` is already false under wasm; nothing to do.

### 4.3 Build

`esbuild.js` gains a third context:

```js
{
  entryPoints: ["src/extension.ts"],
  outfile: "dist/web/extension.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  plugins: [webPlatformPlugin, gplGuardPlugin, esbuildProblemMatcherPlugin],
}
```

No `createRequire` banner (the `common` object must be split so the web
context does not inherit it). `package.json` gets
`"browser": "./dist/web/extension.js"`. `.vscodeignore` needs no change
(`dist/` and the package directory are already shipped); verify with
`npx vsce ls` (see the `vsce` UUID-path caveat: run it from a clean path).

### 4.4 Manifest and docs

- `capabilities.virtualWorkspaces.description`: mention that VS Code for the
  Web always uses the wasm runtime.
- `shellcheck.runtime` `markdownDescription`: add "In VS Code for the Web the
  wasm runtime is always used."
- README: a "VS Code for the Web" section: works on vscode.dev and
  github.dev; needs a cross-origin isolated host (self-hosted servers must
  send COOP `same-origin` + COEP `require-corp`); Safari 18.2 or newer;
  `.shellcheckrc` and `source` resolve within the document's workspace
  folder, as with the desktop wasm runtime.

### 4.5 Tests

Desktop suites stay as they are and must stay green; they cover the Node
platform module through the existing paths.

New web E2E suite, run by `@vscode/test-web` in headless Chromium:

- devDependencies: `@vscode/test-web`, `mocha` (browser build),
  `@types/mocha` already present.
- `test/web/index.ts`: loads `mocha/mocha.js`, `mocha.setup({ ui: "tdd",
  reporter: undefined, timeout: 60000 })`, imports the suites, runs and
  rejects on failures (the pattern from the `yo code` web template). Bundled
  by esbuild (browser, CJS, `external: ["vscode"]`) to
  `dist/web/test/index.js`; it is never shipped (`.vscodeignore` already
  excludes everything not listed, but confirm `dist/web/test/` is excluded
  by adding `dist/web/test/**` explicitly).
- Workspace: `test/fixtures/wasm-parity` (it already has `.shellcheckrc` and
  `source` targets).
- Cases, each asserting on `vscode.languages.getDiagnostics(uri)` after
  waiting for diagnostics to change:
  1. A fixture that sources another file: no SC1091, and the sourced
     variable is not SC2154.
  2. `.shellcheckrc` in the folder root is honored (a code it disables is
     absent).
  3. `shellcheck.runtime: "native"` set in workspace settings still lints
     with wasm.
  4. Editing the document (onType) re-lints, and the new diagnostic appears.
- Artifact: after the suite, the runner writes the collected diagnostics
  (`{ file, code, severity, line }` sorted) to
  `.e2e-artifacts/web-diagnostics.json` inside the mounted folder through
  `workspace.fs.writeFile`; `test/fixtures/wasm-parity/.e2e-artifacts/` is
  gitignored. Running the suite twice must produce byte-identical files.
- A non-isolated run is covered by a unit test of
  `assertWasmHostSupported` with `crossOriginIsolated` stubbed, not by a
  second browser run.
- Scripts: `build:test:web` (esbuild), `test:web`:
  `vscode-test-web --browserType=chromium --headless --coi --extensionDevelopmentPath=. --extensionTestsPath=dist/web/test/index.js test/fixtures/wasm-parity`.
  `test:web` is not part of `npm test`.
- CI: a new `test-web` job on `ubuntu-latest`: `npm ci`,
  `npx playwright install --with-deps chromium`, `npm run build`,
  `npm run build:test:web`, `npm run test:web`. Add it to the `needs` of
  the release job.

### 4.6 Out of scope

Firefox and WebKit runs; self-hosted COI detection beyond the error;
performance work; `code serve-web` verification.

## 5. Order

1. Package §3 → PR on `shellcheck-wasm`, Timon merges and publishes
   0.2.0-next.1.
2. Extension §4.1–4.4 can start against a local `npm pack` of the package
   branch; the dependency is switched to `0.2.0-next.1` once it is on npm.
3. Extension §4.5, then PR.
