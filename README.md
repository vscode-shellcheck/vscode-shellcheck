# vscode-shellcheck

[![Build Status](https://timonwong.visualstudio.com/vscode-shellcheck/_apis/build/status/timonwong.vscode-shellcheck?branchName=master)](https://timonwong.visualstudio.com/vscode-shellcheck/_build/latest?definitionId=1&branchName=master)
[![Current Version](https://vsmarketplacebadge.apphb.com/version/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![Install Count](https://vsmarketplacebadge.apphb.com/installs-short/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)

## Disclaimer

vscode-shellcheck (this "extension"), requires [shellcheck] (the awesome static analysis tool for shell scripts) to work.

Since v0.10.0, precompiled [shellcheck] binaries are bundled for these platforms:
- Linux (x86_64)
- macOS (x86_64)
- Windows: precompiled 32bit binary will be used on both 32bit and 64bit Windows, please note that this requires you have [WoW64](https://en.wikipedia.org/wiki/WoW64) enabled, althouth it's not a problem for Desktop users.

## Requirements

1. Run [`Install Extension`](https://code.visualstudio.com/docs/editor/extension-gallery#_install-an-extension) command from [Command Palette](https://code.visualstudio.com/Docs/editor/codebasics#_command-palette).
2. Search and choose `shellcheck`.

## Options

There are various options that can be configured by making changes to your user or workspace preferences.

Default options are:

```javascript
{
    "shellcheck.enable": true,
    "shellcheck.enableQuickFix": false,
    "shellcheck.run": "onType",
    "shellcheck.executablePath": "",  // Priority: user defined > bundled shellcheck binary > "shellcheck"
    "shellcheck.exclude": [],
    "shellcheck.customArgs": [],
    "shellcheck.ignorePatterns": {
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
    "shellcheck.ignoreFileSchemes": ["git", "gitfs"],
    "shellcheck.useWSL": false
}
```

### `shellcheck.ignorePatterns`

The `shellcheck.ignorePatterns` works exactly the same as `search.exclude`, read more about glob patterns [here](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options)

For example:

```javascript
{
    "shellcheck.ignorePatterns": {
        "**/*.zsh": true,
        "**/*.zsh*": true,
        "**/.git/*.sh": true,
        "**/folder/**/*.sh": true
    }
}
```

### Experimental Quick Fix

In order to enable the "auto fix" feature, [shellcheck] **v0.7.0** or better is required.

Since this feature is still in experimental, additionally, `shellcheck.enableQuickFix` should be `true`:

```javascript
{
    "shellcheck.enableQuickFix": true
}
```

### Lint onType or onSave

By default the linter will lint as you type. Alternatively, set `shellcheck.run` to `onSave` if you want to lint only when the file is saved (works best if auto-save is on).

```javascript
{
    "shellcheck.run": "onType" // also: "onSave"
}
```

### Excluding Checks

By default all shellcheck checks are performed and reported on as necessary. To globally ignore certain checks in all files, add the "SC identifiers" to `shellcheck.exclude`. For example, to exclude [SC1017](https://github.com/koalaman/shellcheck/wiki/SC1017):

```javascript
{
    "shellcheck.exclude": ["1017"],
}
```

### Using Docker version of shellcheck

In order to get it work, you need a "shim" script, and then, just remember, do not try to construct command line arguments for shellcheck yourself.

Here is a simple "shim" script to get start with (See discussion: [#24](https://github.com/timonwong/vscode-shellcheck/issues/24)):

```shell
#!/bin/bash

exec docker run --rm -i -v "$PWD:/mnt:ro" koalaman/shellcheck:v0.7.0 "$@"
```

## Acknowledgements

This extension is based on [hoovercj's Haskell Linter](https://github.com/hoovercj/vscode-haskell-linter).

### Contributors

- [@felipecrs](https://github.com/felipecrs)
- [@sylveon](https://github.com/sylveon)
- [@ralish](https://github.com/ralish)

## LICENSE

This extension is licensed under the [MIT LICENSE](https://github.com/timonwong/vscode-shellcheck/blob/master/LICENSE).

Bundled [shellcheck] binaries are licensed under [GPLv3](https://github.com/koalaman/shellcheck/blob/master/LICENSE).

[shellcheck]: https://github.com/koalaman/shellcheck
