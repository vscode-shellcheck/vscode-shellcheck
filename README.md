# ShellCheck for Visual Studio Code

Integrates [ShellCheck](https://github.com/koalaman/shellcheck) into VS Code, a linter for Shell scripts.

[![Latest version](https://badgen.net/github/release/vscode-shellcheck/vscode-shellcheck?label=Latest%20version)](https://github.com/vscode-shellcheck/vscode-shellcheck/releases/latest)
[![VS Marketplace installs](https://badgen.net/vs-marketplace/i/timonwong.shellcheck?label=VS%20Marketplace%20installs)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![VS Marketplace downloads](https://badgen.net/vs-marketplace/d/timonwong.shellcheck?label=VS%20Marketplace%20downloads)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![Open VSX downloads](https://badgen.net/open-vsx/d/timonwong/shellcheck?color=purple&label=Open%20VSX%20downloads)](https://open-vsx.org/extension/timonwong/shellcheck)

## Quick start

![Extension GIF](https://user-images.githubusercontent.com/29582865/106907134-c299c000-66b2-11eb-8d8b-ea1bd898cb3a.gif)

## Disclaimer

This VS Code extension requires [ShellCheck] (the awesome static analysis tool for shell scripts) to work, but precompiled [ShellCheck] binaries are bundled in this extension for these platforms:

- Linux (`x86_64`, `arm64`, `arm`)
- macOS (`x86_64`, `arm64`)
- Windows (`x86_64`, `arm64` with the `x86_64` binary)

A WebAssembly (WASI) build of [ShellCheck] is bundled for every platform as well.

## Troubleshooting

If ShellCheck seems not working, a helper command _ShellCheck: Collect Diagnostics For Current Document_ from the [Command Palette](https://code.visualstudio.com/Docs/editor/codebasics#_command-palette) is provided to help troubleshooting.

## Options

There are various options that can be configured by making changes to your user or workspace preferences.

Default options are:

```jsonc
{
  "shellcheck.enable": true,
  "shellcheck.enableQuickFix": true,
  "shellcheck.run": "onType",
  "shellcheck.executablePath": "", // Priority: user defined > bundled binary > shellcheck in PATH
  "shellcheck.exclude": [],
  "shellcheck.customArgs": [],
  "shellcheck.ignorePatterns": {
    "**/*.csh": true,
    "**/*.cshrc": true,
    "**/*.fish": true,
    "**/*.login": true,
    "**/*.logout": true,
    "**/*.tcsh": true,
    "**/*.tcshrc": true,
    "**/*.xonshrc": true,
    "**/*.xsh": true,
    "**/*.zsh": true,
    "**/*.zshrc": true,
    "**/zshrc": true,
    "**/*.zprofile": true,
    "**/zprofile": true,
    "**/*.zlogin": true,
    "**/zlogin": true,
    "**/*.zlogout": true,
    "**/zlogout": true,
    "**/*.zshenv": true,
    "**/zshenv": true,
    "**/*.zsh-theme": true
  },
  "shellcheck.ignoreFileSchemes": ["git", "gitfs", "output"]
}
```

### `shellcheck.ignorePatterns`

The `shellcheck.ignorePatterns` works exactly the same as `search.exclude`, read more about glob patterns [here](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options).

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

To add additional ignore patterns atop the default patterns, you have to copy the default ignore patterns and then add yours to the end of the list ([#1196](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/1196)).

### Fix all errors on save

The auto-fixable errors can be fixed automatically on save by using the following configuration:

```jsonc
{
  "editor.codeActionsOnSave": {
    "source.fixAll.shellcheck": "explicit"
  }
}
```

Alternatively, you can fix all errors on demand by running the command _Fix All_ in the VS Code Command Palette.

### Lint `onType` or `onSave`

By default the linter will lint as you type. Alternatively, set `shellcheck.run` to `onSave` if you want to lint only when the file is saved (works best if auto-save is on).

```jsonc
{
  "shellcheck.run": "onType" // also: "onSave"
}
```

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

As last resort, you can also add the _SC_ identifiers to `shellcheck.exclude` extension setting. For example, to exclude [SC1017](https://github.com/koalaman/shellcheck/wiki/SC1017):

```jsonc
{
  "shellcheck.exclude": ["1017"]
}
```

### Using ShellCheck through Docker

In order to get it working, you need a _shim_ script. Avoid including ShellCheck arguments in it.

Here is a simple shim script to get started with (see discussion: [#24](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/24)):

```shell
#!/bin/bash

exec docker run --rm -i -v "${PWD}:${PWD}:ro" -w "${PWD}" koalaman/shellcheck:latest "$@"
```

For example, you can place it at `shellcheck.sh` in the root of your workspace with execution permission (`chmod +x shellcheck.sh`).

You can can then configure the extension to use it with:

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

Just have in mind that this should come with a performance hit, as booting up a docker container is slower than just invoking the binary.

### Experimental WebAssembly runtime

A WebAssembly build of [ShellCheck] is bundled in this extension and can check your scripts on its own. It needs no `shellcheck` executable on your machine, and it works on every platform, including those with no prebuilt ShellCheck binary.

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

## Advanced usage

### Integrating other VS Code extensions

This extension provides a small API, which allows other VS Code extensions to interact with the ShellCheck extension. For details, see [API.md](./doc/API.md).

## Acknowledgements

This extension was originally based on [@hoovercj](https://github.com/hoovercj)'s [Haskell Linter](https://github.com/hoovercj/vscode-haskell-linter).

## License

This extension is licensed under the [MIT license](./LICENSE).

The bundled [ShellCheck] binaries are licensed under [GPLv3](https://github.com/koalaman/shellcheck/blob/master/LICENSE). The WebAssembly build of [ShellCheck] ships as the separate [`@vscode-shellcheck/shellcheck-wasm`](https://www.npmjs.com/package/@vscode-shellcheck/shellcheck-wasm) package, also under GPLv3, with its own `LICENSE` inside `node_modules/@vscode-shellcheck/shellcheck-wasm`.

[ShellCheck]: https://github.com/koalaman/shellcheck
