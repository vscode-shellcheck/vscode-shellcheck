# Agent guide

## Commits and PRs

- semantic-release builds `CHANGELOG.md` from commit subjects (Conventional Commits, see `common.release.config.js`), so each subject is a specific, user-facing changelog sentence.
- A PR with one user-facing change is squashed; its title becomes the entry. A PR with several keeps one commit per change and is merged with **Rebase and merge**; fold test and docs commits into the change they belong to.
- PRs target `master`. Split large work into stacked PRs.

## Code

- Logging is inline `logging.*` calls at the event site. Keep state, timers, and test hooks that exist only to feed logs out of the code; log output has no tests.
- A comment states the non-obvious reason. The code already says what it does.

## Tests

`npm test` builds, runs every `vscode-test` label in `.vscode-test.js`, then lints, formats, and spell-checks. While iterating, build once and run only the affected suite:

```sh
npm run build:all
npx vscode-test --label integration --grep "<suite name>"
```

Run the full `npm test` once before opening the PR.
