# Translations

Each display language has two files, named after its VS Code locale ID:

- `package.nls.<locale>.json` in the repository root translates `package.nls.json`: settings, commands, and the walkthrough.
- `l10n/bundle.l10n.<locale>.json` translates `l10n/bundle.l10n.json`: everything the extension shows while it runs.

To add a language, copy both English files, keep the keys, and translate the values. A key left out shows the English text.

## Every language

- Keep `{0}` placeholders, Markdown, backticks, `$(codicon)` tokens, and `command:` links exactly as they are.
- Keep identifiers in English: setting keys and values (such as `native` and `wasm`), command IDs, `SC####` codes, file names such as `.shellcheckrc`, and the names ShellCheck, shellcheck (the program), WebAssembly, and WASM.
- Use the terms of VS Code's own language pack for the language, so the extension reads like the rest of the editor.

## Glossaries

### Simplified Chinese (`zh-cn`)

| English         | zh-cn    |
| --------------- | -------- |
| lint            | 检查     |
| runtime         | 运行时   |
| shebang         | (as is)  |
| Settings        | 设置     |
| Command Palette | 命令面板 |
| workspace       | 工作区   |
| status bar      | 状态栏   |
| Quick Fix       | 快速修复 |
| Output          | 输出     |

Put a half-width space between Chinese and Latin words or numbers.
