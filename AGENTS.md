# Agent guide

Read [`DEVELOP.md`](DEVELOP.md) before building, testing, or touching CI and releases: setup, test labels, and the project layout are there. Read [`l10n/README.md`](l10n/README.md) before adding or editing a translation.

## Commits and PRs

- semantic-release builds `CHANGELOG.md` from commit subjects (Conventional Commits, see `common.release.config.js`), so each subject is a specific, user-facing changelog sentence.
- A PR with one user-facing change is squashed; its title becomes the entry. A PR with several keeps one commit per change and is merged with **Rebase and merge**; fold test and docs commits into the change they belong to.
- PRs target `master`. Split large work into stacked PRs.

## Code

- Logging is inline `logging.*` calls at the event site. Keep state, timers, and test hooks that exist only to feed logs out of the code; log output has no tests.
- A comment states the non-obvious reason. The code already says what it does.

## Workspace Trust

The extension keeps working in Restricted Mode (`untrustedWorkspaces.supported` is `"limited"`), so an untrusted workspace must never decide what runs on the user's machine:

- A setting that picks a program to run, or a file to load as code, is listed in `capabilities.untrustedWorkspaces.restrictedConfigurations`, and VS Code then gives the extension only the user's value. Today that is `shellcheck.executablePath`.
- Workspace files are data: the document's text, `.shellcheckrc` and `source`d scripts are read, never executed, imported or `require`d.
- The native runtime spawns ShellCheck through `execa` without a shell, so a setting's values stay arguments. `shellcheck.customArgs` is unrestricted only because no ShellCheck flag runs a program or writes a file; restrict it if one ever does.
- Anything else that needs trust checks `vscode.workspace.isTrusted` before running and hides its UI behind the `isWorkspaceTrusted` context key, and the `untrustedWorkspaces` description says what Restricted Mode turns off.
- Every restricted setting has a case in `test/workspace-trust.test.ts`, which runs in Restricted Mode; [`DEVELOP.md`](DEVELOP.md) explains its runner.

## Docs

- `README.md` is the Marketplace page: user-facing features and settings only. Contributor material goes in `DEVELOP.md`, and the extension API in `doc/API.md`.

## Localization

- User-facing strings go through `vscode.l10n.t()` at runtime, and `package.json` contributions are `%key%` placeholders defined in `package.nls.json`. After changing a runtime string, run `npm run l10n:export` to regenerate `l10n/bundle.l10n.json`; CI fails while it is stale.
- Logs, the Collect Diagnostics report, ShellCheck's own output and the walkthrough SVGs stay English. So do `Error.message` strings, which are logged too: a notification translates its own wording and passes the message in as `{0}`.
- Every language follows the English files in the same change. Rewording, re-meaning, or removing an English string means updating or deleting that key in every `package.nls.<locale>.json` and `l10n/bundle.l10n.<locale>.json`; `l10n/README.md` has the details.

## Tests

While iterating, build once and run only the affected suite; [`DEVELOP.md`](DEVELOP.md) lists the labels:

```sh
npm run build:all
npx vscode-test --label integration --grep "<suite name>"
```

Run the full `npm test` once before opening the PR.
