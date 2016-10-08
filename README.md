# vscode-shellcheck

## Requirements

1. Ensure `shellcheck` is [installed](https://github.com/koalaman/shellcheck#installing).
2. Run `Install Extension` command from Command Palette.
3. Search and choose `shellcheck`.

## Options

There are various options that can be configured by making changes to your user or workspace preferences.

Default options are:

```json
{
    "shellcheck.run": "onType",
    "shellcheck.executablePath": "shellcheck",
    "shellcheck.exclude": []
}
```

### Lint onType or onSave

By default the linter will lint as you type. Alternatively, set `shellcheck.run` to `onSave` or `never` if you want to lint only when the file is saved (works best if auto-save is on) or disable it for a workspace or entirely.

```javascript
{
    "shellcheck.run": "onType" // also: "onSave", "never"
}
```

## Acknowledgements

This extension is based on [hoovercj's vscode-haskell-linter](https://github.com/hoovercj/vscode-haskell-linter).
