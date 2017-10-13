# vscode-shellcheck

[![Current Version](https://vsmarketplacebadge.apphb.com/version/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)
[![Install Count](https://vsmarketplacebadge.apphb.com/installs-short/timonwong.shellcheck.svg)](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)

## Requirements

1. Ensure `shellcheck` is [installed](https://github.com/koalaman/shellcheck#installing).
2. Run [`Install Extension`](https://code.visualstudio.com/docs/editor/extension-gallery#_install-an-extension) command from [Command Palette](https://code.visualstudio.com/Docs/editor/codebasics#_command-palette).
3. Search and choose `shellcheck`.

## Options

There are various options that can be configured by making changes to your user or workspace preferences.

Default options are:

```json
{
    "shellcheck.enable": true,
    "shellcheck.run": "onType",
    "shellcheck.executablePath": "shellcheck",
    "shellcheck.exclude": [],
    "shellcheck.customArgs": []
}
```

### Lint onType or onSave

By default the linter will lint as you type. Alternatively, set `shellcheck.run` to `onSave` if you want to lint only when the file is saved (works best if auto-save is on).

```javascript
{
    "shellcheck.run": "onType" // also: "onSave"
}
```

## Acknowledgements

This extension is based on [hoovercj's Haskell Linter](https://github.com/hoovercj/vscode-haskell-linter).
