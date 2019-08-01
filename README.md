# vscode-shellcheck

[![https://travis-ci.com/timonwong/vscode-shellcheck](https://travis-ci.com/timonwong/vscode-shellcheck.svg?branch=master)](https://travis-ci.com/timonwong/vscode-shellcheck)
[![Current Version](https://vsmarketplacebadge.apphb.com/version/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![Install Count](https://vsmarketplacebadge.apphb.com/installs-short/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)

## Requirements

1. Ensure `shellcheck` is [installed](https://github.com/koalaman/shellcheck#installing) (`v0.7.0` or better is recommended to use).
2. Run [`Install Extension`](https://code.visualstudio.com/docs/editor/extension-gallery#_install-an-extension) command from [Command Palette](https://code.visualstudio.com/Docs/editor/codebasics#_command-palette).
3. Search and choose `shellcheck`.

## Options

There are various options that can be configured by making changes to your user or workspace preferences.

Default options are:

```json
{
    "shellcheck.enable": true,
    "shellcheck.enableQuickFix": false,
    "shellcheck.run": "onType",
    "shellcheck.executablePath": "shellcheck",
    "shellcheck.exclude": [],
    "shellcheck.customArgs": [],
    "shellcheck.ignorePatterns": {},
    "shellcheck.ignoreFileSchemes": ["git", "gitfs"],
    "shellcheck.useWSL": false
}
```

### Experimental Quick Fix

#### Prerequisite

In order to enable the "auto fix" feature, [shellcheck] **v0.7.0** or better is required.

#### Configuration

Since this feature is still in experimental, additionally, `shellcheck.enableQuickFix` should be `true`.

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
    "shellcheck.exclude": [1017],
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

[shellcheck]: https://github.com/koalaman/shellcheck
