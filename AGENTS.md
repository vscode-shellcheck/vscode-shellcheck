# Agent guide

## Commits and PRs

- semantic-release builds `CHANGELOG.md` from commit subjects (Conventional Commits, see `common.release.config.js`), so each subject is a specific, user-facing changelog sentence.
- A PR with one user-facing change is squashed; its title becomes the entry. A PR with several keeps one commit per change and is merged with **Rebase and merge**; fold test and docs commits into the change they belong to.
- PRs target `master`. Split large work into stacked PRs.

## Code

- Logging is inline `logging.*` calls at the event site. Keep state, timers, and test hooks that exist only to feed logs out of the code; log output has no tests.
- A comment states the non-obvious reason. The code already says what it does.

## Localization

- User-facing strings go through `vscode.l10n.t()` at runtime, and `package.json` contributions are `%key%` placeholders defined in `package.nls.json`. After changing a runtime string, run `npm run l10n:export` to regenerate `l10n/bundle.l10n.json`; CI fails while it is stale.
- Logs, the Collect Diagnostics report, ShellCheck's own output and the walkthrough SVGs stay English. So do `Error.message` strings, which are logged too: a notification translates its own wording and passes the message in as `{0}`.
- A language's translations are `package.nls.<locale>.json` and `l10n/bundle.l10n.<locale>.json`; a missing key falls back to English. Read `l10n/README.md` before adding or editing a translation.

## Tests

`npm test` builds, runs every `vscode-test` label in `.vscode-test.js`, then lints, formats, and spell-checks. While iterating, build once and run only the affected suite:

```sh
npm run build:all
npx vscode-test --label integration --grep "<suite name>"
```

Run the full `npm test` once before opening the PR. The localization suite runs only with `VSCODE_TEST_L10N=1`, because it installs a language pack first; CI runs it in one job.
