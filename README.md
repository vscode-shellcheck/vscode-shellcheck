# ShellCheck for Visual Studio Code

Lint shell scripts as you type with [ShellCheck], with quick fixes and nothing else to install.

[![Latest version](https://badgen.net/github/release/vscode-shellcheck/vscode-shellcheck?label=Latest%20version)](https://github.com/vscode-shellcheck/vscode-shellcheck/releases/latest)
[![VS Marketplace installs](https://badgen.net/vs-marketplace/i/timonwong.shellcheck?label=VS%20Marketplace%20installs)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![VS Marketplace downloads](https://badgen.net/vs-marketplace/d/timonwong.shellcheck?label=VS%20Marketplace%20downloads)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![Open VSX downloads](https://badgen.net/open-vsx/d/timonwong/shellcheck?color=purple&label=Open%20VSX%20downloads)](https://open-vsx.org/extension/timonwong/shellcheck)

![Extension GIF](https://user-images.githubusercontent.com/29582865/106907134-c299c000-66b2-11eb-8d8b-ea1bd898cb3a.gif)

- Reports ShellCheck's warnings in the editor and the Problems view, as you type or on save.
- Quick fixes for single warnings, and _Fix All_ for the whole file.
- Bundles ShellCheck, so there is no binary to install on common platforms.
- Works on [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev) through a bundled WebAssembly build.
- Reads your `.shellcheckrc`, like the `shellcheck` command line does.

## Usage

Open a shell script. ShellCheck checks it as you type, underlines each problem, and lists it in the Problems view. Hover a problem for its rule code and a link to the rule's documentation, or use the light bulb to apply a fix.

The ShellCheck icon on the right of the status bar opens a menu to lint the current document, change when ShellCheck runs, or turn it off for the workspace. The same actions are in the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette):

| Command                                                | What it does                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| _ShellCheck: Lint Current Document_                    | Lints the active script now.                                              |
| _ShellCheck: Show Menu_                                | Opens the status bar menu.                                                |
| _ShellCheck: Collect Diagnostics For Current Document_ | Opens a troubleshooting report for the active script.                     |
| _ShellCheck: Use the Experimental WebAssembly Runtime_ | Switches to the [WebAssembly runtime](#experimental-webassembly-runtime). |

To apply every automatic fix on save:

```jsonc
{
  "editor.codeActionsOnSave": {
    "source.fixAll.shellcheck": "explicit"
  }
}
```

To do it on demand instead, run _Fix All_ from the Command Palette.

## Installation

Install ShellCheck from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck), or from [Open VSX](https://open-vsx.org/extension/timonwong/shellcheck) in VSCodium and other editors that use it. From the Command Palette:

```text
ext install timonwong.shellcheck
```

The extension bundles precompiled [ShellCheck] binaries for:

- Linux (`x86_64`, `arm64`, `arm`)
- macOS (`x86_64`, `arm64`)
- Windows (`x86_64`, `arm64` with the `x86_64` binary)

On other platforms, it runs the `shellcheck` found on your `PATH`. To use a different binary, set `shellcheck.executablePath`; it takes priority over the bundled one. In [Restricted Mode](https://code.visualstudio.com/docs/editor/workspace-trust), only the value from your user settings is used.

A WebAssembly build of ShellCheck is bundled for every platform as well; see [Experimental WebAssembly runtime](#experimental-webassembly-runtime).

## Settings

| Setting                                 | Default                           | Description                                                                                       |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `shellcheck.enable`                     | `true`                            | Turns ShellCheck on or off.                                                                       |
| `shellcheck.run`                        | `"onType"`                        | When to lint: `"onType"`, `"onSave"`, or `"manual"` (only the _Lint Current Document_ command).   |
| `shellcheck.enableQuickFix`             | `true`                            | Offers quick fixes.                                                                               |
| `shellcheck.exclude`                    | `[]`                              | Rule codes to ignore, such as `"1017"`. Prefer `.shellcheckrc`.                                   |
| `shellcheck.customArgs`                 | `[]`                              | Extra arguments for ShellCheck. Prefer `.shellcheckrc`.                                           |
| `shellcheck.ignorePatterns`             | csh, fish, tcsh, xonsh, zsh files | Files not to lint. See [below](#shellcheckignorepatterns).                                        |
| `shellcheck.ignoreFileSchemes`          | Git and pull request views        | URI schemes not to lint, such as `git` and `review`.                                              |
| `shellcheck.markdownDiagnostics`        | `false`                           | Experimental formatted hover. See [below](#shellcheckmarkdowndiagnostics).                        |
| `shellcheck.watchConfigFiles.workspace` | `false`                           | Lints open scripts again when a `.shellcheckrc` in the workspace changes.                         |
| `shellcheck.watchConfigFiles.user`      | `false`                           | The same, for config files outside the workspace, such as `~/.shellcheckrc`. Native runtime only. |
| `shellcheck.runtime`                    | `"native"`                        | `"native"` or the experimental `"wasm"`.                                                          |
| `shellcheck.executablePath`             | bundled                           | Path to the `shellcheck` executable.                                                              |
| `shellcheck.useWorkspaceRootAsCwd`      | `false`                           | Runs ShellCheck from the workspace root instead of the script's directory.                        |
| `shellcheck.runTimeout`                 | `0`                               | Seconds before a native run is stopped; `0` for no limit.                                         |
| `shellcheck.maxConcurrentRuns`          | `0`                               | Most native runs at once; `0` for no limit.                                                       |
| `shellcheck.disableVersionCheck`        | `false`                           | Stops prompting to update an outdated `shellcheck` binary.                                        |
| `shellcheck.logLevel`                   | `"info"`                          | Level of the extension's log.                                                                     |

The Settings editor shows the full default lists.

### Configuring ShellCheck

[ShellCheck] has a default set of checks, but it is also configurable using [RC files](https://github.com/koalaman/shellcheck/blob/master/shellcheck.1.md#rc-files). To configure your project, add a `.shellcheckrc` at the workspace root. If no `.shellcheckrc` is found in any of the parent directories, ShellCheck will look in `~/.shellcheckrc` followed by the `$XDG_CONFIG_HOME` (usually `~/.config/shellcheckrc`) on Unix, or `%APPDATA%/shellcheckrc` on Windows. Only the first file found will be used.

Here is an example `.shellcheckrc`:

```ini
# Look for 'source'd files relative to the checked script,
# and also look for absolute paths in /mnt/chroot
source-path=SCRIPTDIR
source-path=/mnt/chroot

# Since ShellCheck 0.9.0, values can be quoted with '' or "" to allow spaces
source-path="My Documents/scripts"

# Allow opening any 'source'd file, even if not specified as input
external-sources=true

# Turn on warnings for unquoted variables with safe values
enable=quote-safe-variables

# Turn on warnings for unassigned uppercase variables
enable=check-unassigned-uppercase

# Allow [ ! -z foo ] instead of suggesting -n
disable=SC2236
```

By default, a changed `.shellcheckrc` applies to a script the next time it is linted. To lint open scripts again right away, turn on `shellcheck.watchConfigFiles.workspace`, and `shellcheck.watchConfigFiles.user` for config files outside the workspace.

As a last resort, you can also add rule codes to `shellcheck.exclude`. For example, to exclude [SC1017](https://github.com/koalaman/shellcheck/wiki/SC1017):

```jsonc
{
  "shellcheck.exclude": ["1017"]
}
```

### `shellcheck.ignorePatterns`

Each key of `shellcheck.ignorePatterns` is a [picomatch](https://github.com/micromatch/picomatch#readme) glob pattern, matched against the file's path relative to its workspace folder. Files outside every workspace folder are matched by their absolute path, so start patterns with `**/`. Wildcards also match dot files, and extglob patterns such as `!(…)` are supported.

For example:

```jsonc
{
  "shellcheck.ignorePatterns": {
    "**/*.zsh": true,
    "**/*.zsh*": true,
    "**/.git/*.sh": true,
    "**/folder/**/*.sh": true
  }
}
```

To skip files without an extension (dot files such as `.bashrc` count as having one):

```jsonc
{
  "shellcheck.ignorePatterns": {
    "**/!(*.*)": true
  }
}
```

Your patterns are merged with the defaults, so list only the ones you add or change. Set a default pattern to `false` to lint those files again:

```jsonc
{
  "shellcheck.ignorePatterns": {
    "**/bin/**": true,
    "**/*.fish": false
  }
}
```

### `shellcheck.markdownDiagnostics`

`shellcheck.markdownDiagnostics` is experimental. Enable it to show a formatted hover with a colored severity, a muted rule code, and a link to the rule documentation. Colors follow the active editor theme. Common ShellCheck code examples in diagnostic messages are rendered as Markdown code spans; messages remain plain text in the Problems view.

#### How to hide the original diagnostics

VS Code displays the original diagnostic alongside the formatted hover. To hide the original ShellCheck diagnostics and put the formatted hover first:

1. Install [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css).
2. Follow the installation instructions provided by that extension.
3. Load [`doc/markdown-diagnostics.css`](https://github.com/vscode-shellcheck/vscode-shellcheck/blob/master/doc/markdown-diagnostics.css).

Only ShellCheck's original diagnostics are hidden; diagnostics from other sources and the Quick Fix / View Problem actions stay visible below the formatted hover.

#### Why is this workaround required?

VS Code currently does not expose an extension API for ordering hover providers or replacing the native diagnostic hover. This formatted-hover implementation follows the approach used by [Pretty TypeScript Errors](https://github.com/yoavbls/pretty-ts-errors), including the internal marker and CSS workaround that hides the native rows and moves the formatted row first. [Read more about the workaround](https://github.com/yoavbls/pretty-ts-errors/blob/main/docs/hide-original-errors.md).

Messages are formatted only when you hover, and not at all while the setting is off.

### Limiting concurrent ShellCheck processes

Changing a setting or a `.shellcheckrc` lints every open script again, which starts one `shellcheck` process per script. With many scripts open, set `shellcheck.maxConcurrentRuns` to cap how many run at once; the others wait their turn. The default, `0`, sets no limit. A run that never finishes keeps its slot, so pair this with `shellcheck.runTimeout`. Only the native runtime is affected: the WebAssembly runtime always lints one script at a time.

```jsonc
{
  "shellcheck.maxConcurrentRuns": 4
}
```

### Using ShellCheck through Docker

Point `shellcheck.executablePath` at a _shim_ script that runs ShellCheck in a container. Keep ShellCheck arguments out of the script.

Here is a simple shim script to get started with (see discussion: [#24](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/24)):

```shell
#!/bin/bash

exec docker run --rm -i -v "${PWD}:${PWD}:ro" -w "${PWD}" koalaman/shellcheck:latest "$@"
```

For example, place it at `shellcheck.sh` in the root of your workspace with execution permission (`chmod +x shellcheck.sh`), then configure the extension to use it:

```jsonc
// .vscode/settings.json
{
  // use the shim as shellcheck executable
  "shellcheck.executablePath": "${workspaceFolder}/shellcheck.sh",

  // you may also need to turn this option on, so shellcheck in the container
  // can access all the files in the workspace and not only the directory
  // where the file being linted is.
  "shellcheck.useWorkspaceRootAsCwd": true
}
```

Starting a container is slower than running the binary, so expect each lint to take longer.

## Experimental WebAssembly runtime

A WebAssembly build of [ShellCheck] is bundled in this extension and can check your scripts on its own. It needs no `shellcheck` executable on your machine, and it works on every platform, including those with no prebuilt ShellCheck binary. It reads `.shellcheckrc` and `source` targets through VS Code rather than from disk, so it also checks scripts in virtual workspaces and on any other file system VS Code can open; the native runtime cannot lint documents of a virtual workspace.

To turn it on:

```jsonc
{
  "shellcheck.runtime": "wasm" // also: "native", the default
}
```

This runtime is experimental and unsupported. It never falls back to the native binary: if it fails to start or a check crashes, your scripts stop being checked until you switch back. The failure is reported once per session, with the actions _Switch back to native_ and _Show Log_.

It is also 3-4x slower than the native binary, and linting as you type correspondingly waits longer after your last keystroke. For large files, consider setting `shellcheck.run` to `onSave`.

Known limitations:

- `shellcheck.executablePath` is ignored.
- Only files inside the document's workspace folder are readable, so `source` targets and `.shellcheckrc` files outside that folder are not found. A file that belongs to no workspace folder sees only its own directory, and an untitled document sees no files at all.
- Symbolic links inside that folder are followed wherever they lead.
- Path-like entries in `shellcheck.customArgs` are passed through unchanged. They name locations on your machine, which this runtime does not see under those names, so they will not resolve.

### VS Code for the Web

The extension works on [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev), where it always uses the WebAssembly runtime. A self-hosted VS Code for the Web must be cross-origin isolated by sending COOP `same-origin` and COEP `require-corp` headers.

Supported browsers are Chrome and Edge 112 or later, Firefox 121 or later, and Safari 18.2 or later (macOS 13 or later, iOS and iPadOS 18.2 or later). Safari 16.4 to 18.1 and Firefox ESR 115 are not supported: they lack WebAssembly tail calls, and the extension reports that instead of linting.

`.shellcheckrc` and `source` paths resolve within the document's workspace folder, as they do with the desktop WebAssembly runtime.

## Troubleshooting

If ShellCheck reports nothing or seems stuck, run _ShellCheck: Collect Diagnostics For Current Document_ from the Command Palette with the script open. It opens a report showing which ShellCheck runs, its version, and why the script may be skipped, such as an ignore pattern or an ignored file scheme. Attach it when you open an issue.

## API for other extensions

This extension provides a small API, which allows other VS Code extensions to interact with the ShellCheck extension. For details, see [API.md](./doc/API.md).

## Contributing

To build, test, or translate the extension, see [DEVELOP.md](./DEVELOP.md).

## Acknowledgements

This extension was originally based on [@hoovercj](https://github.com/hoovercj)'s [Haskell Linter](https://github.com/hoovercj/vscode-haskell-linter).

## License

This extension is licensed under the [MIT license](./LICENSE).

The bundled [ShellCheck] binaries are licensed under [GPLv3](https://github.com/koalaman/shellcheck/blob/master/LICENSE). The WebAssembly build of [ShellCheck] ships as the separate [`@vscode-shellcheck/shellcheck-wasm`](https://www.npmjs.com/package/@vscode-shellcheck/shellcheck-wasm) package, also under GPLv3, with its own `LICENSE` inside `node_modules/@vscode-shellcheck/shellcheck-wasm`.

[ShellCheck]: https://github.com/koalaman/shellcheck
