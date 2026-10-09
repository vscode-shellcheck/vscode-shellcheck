# Contributing to ShellCheck for Visual Studio Code

## Setup

Node.js and npm versions are pinned in `mise.toml`; with [mise](https://mise.jdx.dev) installed, `mise install` provides them.

```sh
npm ci
```

`npm ci` runs [bindl](https://github.com/felipecrs/bindl), which downloads the ShellCheck binaries listed in `bindl.config.ts` into `binaries/`. Set `BINDL_CURRENT_ONLY=true` to download only the binary for your platform, or `BINDL_SKIP=true` to download none. The WebAssembly build comes from the `@vscode-shellcheck/shellcheck-wasm` npm package.

## Running the extension

Open the repository in VS Code and start the **Run Extension** launch configuration (F5). Its build task, `build:all:watch`, type-checks and rebuilds `dist/` and `out/` on every save.

From a terminal:

| Command                                    | Output                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `npm run build`                            | Type-checks, then bundles the extension into `dist/`        |
| `npm run build:test`                       | Compiles the tests into `out/test/`                         |
| `npm run build:all`                        | Both of the above                                           |
| `npm run build:prod`                       | Minified bundle, as published                               |
| `npm run build:icons`                      | Regenerates `resources/shellcheck-icons.woff` from the SVGs |
| `node resources/build-walkthrough-svg.mjs` | Regenerates `resources/walkthrough/*.svg`                   |

## Project layout

| Path                         | Contents                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| `src/extension.ts`           | Activation entry point                                                 |
| `src/linter.ts`              | Document tracking, lint scheduling, diagnostics and code actions       |
| `src/runtime/`               | The native and WebAssembly runtimes and the manager that switches them |
| `src/platform/`              | Desktop and web variants of platform-specific code                     |
| `test/`                      | Integration tests, run inside VS Code                                  |
| `test/web/`                  | The VS Code for the Web suite                                          |
| `test/workspace-trust/`      | The runner for the Restricted Mode suite                               |
| `l10n/`, `package.nls*.json` | Translations; see [`l10n/README.md`](l10n/README.md)                   |
| `doc/API.md`                 | The API offered to other extensions                                    |
| `docs/plans/`                | Design notes and spike reports behind larger features                  |

## Tests

Every test runs inside a real VS Code instance through `@vscode/test-cli`. Each label in `.vscode-test.js` is a separate instance with its own workspace setup:

| Label         | Suites                                                      | Opens                              |
| ------------- | ----------------------------------------------------------- | ---------------------------------- |
| `integration` | Every `test/*.test.ts` not listed below                     | No folder                          |
| `parity`      | `parity.test.ts`: native and WebAssembly give equal results | `test/fixtures/wasm-parity`        |
| `rc-watch`    | `rc-watch.test.ts`                                          | `test/fixtures/rc-watch/workspace` |
| `l10n-zh-cn`  | `l10n.test.ts`, only with `VSCODE_TEST_L10N=1`              | No folder, Simplified Chinese UI   |

While iterating, build once and run only the affected suite:

```sh
npm run build:all
npx vscode-test --label integration --grep "<suite name>"
```

`npm test` builds, runs every label and the Workspace Trust suite, then lints, checks formatting, spell-checks, and checks that installed dependencies satisfy `engines`. `VSCODE_TEST_VERSION` picks the VS Code version (default `stable`).

The localization label installs the Simplified Chinese language pack into its own user data under `.vscode-test/`, so the other labels keep the English UI:

```sh
VSCODE_TEST_L10N=1 npx vscode-test --label l10n-zh-cn
```

The Workspace Trust suite opens `test/fixtures/workspace-trust` in Restricted Mode and checks that the workspace's `restrictedConfigurations` values are ignored. `@vscode/test-electron` always passes `--disable-workspace-trust`, so `test/workspace-trust/run.mjs` launches VS Code itself, with its own user data under `.vscode-test/`. It writes what it linted to `out/workspace-trust-e2e/diagnostics.json`:

```sh
npm run build:all && npm run test:workspace-trust
```

The web suite runs the extension in headless Chromium through `@vscode/test-web` and writes the diagnostics it produced to `out/web-e2e/diagnostics.json`:

```sh
npx playwright install chromium
npm run build && npm run build:test:web && npm run test:web
```

The **Extension Tests** launch configuration runs the tests under the debugger.

## Localization

Runtime strings go through `vscode.l10n.t()`, and `package.json` contributions use `%key%` placeholders defined in `package.nls.json`. After changing a runtime string, regenerate the English bundle:

```sh
npm run l10n:export
```

CI fails while `l10n/bundle.l10n.json` is stale (`npm run l10n:check`) or a `%key%` is missing from `package.nls.json` (`.github/scripts/check-nls-keys.mjs`). Translation rules and the steps to add a language are in [`l10n/README.md`](l10n/README.md).

## Continuous integration

`.github/workflows/ci.yaml` runs on pushes to `master`, on every pull request, and nightly to catch new VS Code releases:

- **test**: `npm test` on Linux, Windows, and macOS, against a pinned VS Code version and `stable`; the localization label runs once, on Linux with `stable`.
- **test-web**: the localization checks and the web suite.
- **build**: one `.vsix` per platform target, each bundling that platform's ShellCheck binary, plus a `universal` one with only the WebAssembly build.
- **release**: publishes from `master`.

## Releases

[semantic-release](https://semantic-release.gitbook.io) derives the version and `CHANGELOG.md` from the Conventional Commits on `master` (`common.release.config.js`), then publishes the `.vsix` files to the Visual Studio Marketplace, Open VSX, and a GitHub release. Commit subjects therefore double as changelog entries; [`AGENTS.md`](AGENTS.md) has the commit and PR conventions.
