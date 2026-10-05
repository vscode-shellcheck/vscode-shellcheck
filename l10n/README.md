# Translations

Each display language has two files, named after its VS Code locale ID in lowercase (`zh-cn`, `ja`, `pt-br`):

- `package.nls.<locale>.json` in the repository root translates `package.nls.json`: settings, commands, and the walkthrough.
- `l10n/bundle.l10n.<locale>.json` translates `l10n/bundle.l10n.json`: everything the extension shows while it runs. Its keys are the English strings themselves.

The English files are the source of truth. A key missing from a translation shows the English text; a key the English file no longer has is dead and never shown.

## Rules for every language

- Keep `{0}` placeholders, Markdown, backticks, `$(codicon)` tokens, and `command:` links exactly as they are. Each translation carries the same placeholders as its English string; their order may change to suit the grammar.
- Keep identifiers in English: setting keys and values (such as `native` and `wasm`), command IDs, `SC####` codes, file names such as `.shellcheckrc`, and the names ShellCheck, shellcheck (the program), WebAssembly, and WASM.
- Use the terms of VS Code's own language pack for the language, so the extension reads like the rest of the editor.
- Follow the language's glossary below. Each language has one before its first translation lands: the recurring terms and any typography rules (spacing, punctuation width, quotation marks).
- Translate only these two files. `README.md`, `CHANGELOG.md`, the walkthrough SVGs, logs, the Collect Diagnostics report, and `Error.message` strings stay English.

## Changing an English string

Every translation follows the English file in the same change:

- A reworded runtime string gets a new key in `bundle.l10n.json` after `npm run l10n:export`. In each `bundle.l10n.<locale>.json`, move the translation to the new key and update it, or delete the old key to fall back to English.
- A `package.nls.json` value whose meaning changes keeps its key, so a translation silently goes stale. Update or delete that key in each `package.nls.<locale>.json`.
- A removed string is deleted from every translation.

When you cannot translate a language, delete its stale key and say so in the PR; English is a better fallback than a wrong translation.

## Adding a language

1. Copy `package.nls.json` to `package.nls.<locale>.json` and `l10n/bundle.l10n.json` to `l10n/bundle.l10n.<locale>.json`, keep the keys, and translate the values.
2. Add the locale to `LOCALES` in `test/translations.test.ts`, which checks that every translation holds only English keys and keeps their placeholders, code, and links.
3. Add the language's glossary below.
4. Check the result with VS Code's display language set to the locale (**Configure Display Language**, with the matching language pack installed): Settings, the Command Palette, the status bar menu, a failure notification, and the diagnostic hover.

The language is done when both files hold every English key and nothing else, and the glossary is in place. Ship it as one `feat:` commit, such as `feat: localize the extension UI into Japanese`.

Packaging, spell-checking, and Prettier already cover every locale through globs. The `l10n-zh-cn` test label proves that translations load at all; a new language does not need its own label.

## Glossaries

<!-- cspell:disable -->

### German (`de`)

| English         | de                           |
| --------------- | ---------------------------- |
| lint            | prüfen / Prüfung             |
| runtime         | Laufzeit                     |
| Settings        | Einstellungen                |
| Command Palette | Befehlspalette               |
| workspace       | Arbeitsbereich               |
| status bar      | Statusleiste                 |
| Quick Fix       | Schnelle Problembehebung     |
| Output          | Ausgabe                      |
| Problems view   | Ansicht „Probleme“           |
| walkthrough     | exemplarische Vorgehensweise |
| config file     | Konfigurationsdatei          |
| executable      | ausführbare Datei            |
| binary          | Binärdatei                   |
| bundled         | mitgeliefert                 |
| lint trigger    | Prüfauslöser                 |
| log             | Protokoll                    |

Address the user as "Sie". Use German quotation marks („…“) and a spaced en dash (–) where English has an em dash. Before a noun, the runtime name keeps its base form: "die native Laufzeit".

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
