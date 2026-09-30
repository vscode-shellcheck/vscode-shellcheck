# Research: can release-please replace PR #1968?

Date: 2026-09-30. Scope: research only. Nothing was merged, tagged or released.

**Verdict:** yes. release-please can replace the `prepare` half of #1968 (the release PR). The publish half of #1968 stays our own code: VSIX matrix, Marketplace retry, Open VSX, asset upload, and the "released in vX" comments. Three gaps need small workarounds:

1. Curated edits on the release PR branch are force-overwritten (see §3).
2. Our `CHANGELOG.md` needs a `# Changelog` header line, otherwise new entries land in the wrong place (§2).
3. The action lags the library. It bundles release-please 17.6.x, which writes `closes #N` into the release PR body, so merging the PR can auto-close issues that were only referenced (§11). Use the CLI pinned to ≥ 17.10.4 instead.

Legend: **[src]** = verified in source (permalink), **[docs]** = verified in docs, **[run]** = verified by a dry run or a local script in this research, **[unverified]** = not verified.

Source permalinks point to release-please `main` at [`edce3d8`](https://github.com/googleapis/release-please/tree/edce3d805ef3ac964d1ba2b29b0f42905f2fa412) (2026-09-14, after v17.11.2). `RP` below is short for `https://github.com/googleapis/release-please/blob/edce3d805ef3ac964d1ba2b29b0f42905f2fa412`.

Dry-run config used: [`docs/plans/release-please/`](release-please/). Command (read-only):

```sh
npx release-please@17.11.2 release-pr --dry-run --token "$(gh auth token)" \
  --repo-url vscode-shellcheck/vscode-shellcheck --target-branch research/release-please \
  --config-file docs/plans/release-please/release-please-config.json \
  --manifest-file docs/plans/release-please/.release-please-manifest.json
```

## Summary table

| #   | Requirement                                                      | Status                                                                                                                                                                            |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Same bump / "releasable" rules                                   | **Supported with config:** `changelog-sections` incl. `{type: build, scope: deps}`. `scope` is undocumented but works [run]. No renovate change needed.                           |
| 2   | CHANGELOG format                                                 | **Supported with config + one-time fix:** add a `# Changelog` header. Output differs only by blank lines, `closes`→`refs`, and the date.                                          |
| 3   | Hand-edited release notes                                        | **Needs workaround.** Branch and PR-body edits are overwritten on the next releasable push. Curated content must live on master, or be added last-minute with a freeze gate (§3). |
| 4   | Bootstrap from `v0.42.0`, tags `vX.Y.Z`                          | **Supported natively:** manifest `{".": "0.42.0"}` + `include-component-in-tag: false` [run]                                                                                      |
| 5   | `package.json` + `package-lock.json` (`version`, `packages[""]`) | **Supported natively** [src][run]                                                                                                                                                 |
| 6   | Matrix build → publish → assets → public                         | **Supported with config + our jobs:** `draft: true` + `force-tag-creation: true`; our `release` job publishes, uploads, then un-drafts.                                           |
| 7   | "released in vX" comments + `released` label                     | **Not provided by release-please** [src]. Keep #1968's `announce` (`@semantic-release/github` `success()`).                                                                       |
| 8   | Release PR triggers CI                                           | **Needs PAT/App token** (`GH_TOKEN_SEMANTIC_RELEASE`) [docs]. A tag/release made with `GITHUB_TOKEN` would not matter for our flow.                                               |
| 9   | PR title vs `validate-pr-title`                                  | **Supported:** default `chore(master): release x` passes. Recommend `pull-request-title-pattern: "chore(release): ${version}"` [run].                                             |
| 10  | Force version / hold                                             | **Supported natively:** `Release-As: x.y.z` in a commit body. Hold = leave the PR open. Gotchas in §10.                                                                           |
| 11  | Maintenance                                                      | Library active (17.11.2, 2026-08-24). Action v5.0.0 (2026-04-22) is stale; its bump PRs have been pending for months. Prefer the pinned CLI.                                      |

## 1. Version bump and "releasable" rules

How release-please decides:

- **Releasable** means the rendered changelog entry is not empty. It is not a fixed list of types. [src: `RP/src/strategies/base.ts#L331-L338`, `#L525-L527`]
  - The README says "feat, fix, deps" ([docs](https://github.com/googleapis/release-please#step-1-ensure-releasable-units-are-merged)), but in practice that list is just the default sections. Any type in a non-hidden `changelog-sections` entry releases, and so does any breaking change.
- **Bump size** [src: `RP/src/versioning-strategies/default.ts#L67-L106`]:
  - `Release-As` footer: that exact version.
  - Breaking change: major. That is 1.0.0 from 0.x, because `bump-minor-pre-major` defaults to false.
  - `feat`: minor.
  - Anything else: patch.
- **Scoped sections:** `changelog-sections` is passed as-is to `conventional-changelog-conventionalcommits` `types`, which supports `scope` matching.
  - [src: `RP/src/changelog-notes/default.ts`; preset `writer-opts.js` L66: `if (entry.scope && entry.scope !== commit.scope)`]
  - release-please's JSON schema doesn't list `scope`, but nothing validates the config at runtime, so it passes through. [src: `RP/schemas/config.json` L31-L52; no runtime validation found]

Measured with our proposed sections, using release-please's own notes builder and the same empty-check [run, 17.11.2]:

| Commits                                                            | Result                          |
| ------------------------------------------------------------------ | ------------------------------- |
| `build(deps-dev)`, `ci(deps)`, `chore`, `docs`, `test`, `build: …` | no release                      |
| `build(deps): update remeda`                                       | patch, "Dependencies"           |
| `refactor`, `perf`, `revert`                                       | patch, own section              |
| `fix` / `feat` / `feat!` / `chore!` (from 0.42.0)                  | 0.42.1 / 0.43.0 / 1.0.0 / 1.0.0 |
| `Release-As: 1.0.0` footer                                         | 1.0.0                           |

This equals today's `common.release.config.js` rules. **No renovate change is needed**, because `build(deps)` vs `build(deps-dev)` is resolved by `scope`.

If you'd rather not rely on the undocumented `scope`, the fallback is renovate `semanticCommitType: "deps"` for prod deps. release-please's default heading for `deps` is "Dependencies". But `deps:` is not in `amannn/action-semantic-pull-request`'s default types, so `validate-pr-title` would need a custom `types:` list. Not recommended.

## 2. CHANGELOG format

Rendered by a dry run with the manifest at 0.41.1 (so it re-generates 0.42.0) [run]:

```text
## [0.42.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.41.1...v0.42.0) (2026-09-30)


### Features

* add optional formatted ShellCheck diagnostic hovers ([#1950](…/issues/1950)) ([7761379](…/commit/7761379…)), refs [#1052](…/issues/1052)
```

The current entry is identical except for three things:

- one blank line instead of two after the headings (cosmetic);
- `closes` instead of `refs`. 17.6.x (the action) still prints `closes` [run]; ≥ 17.10.4 prints `refs` ([#2851](https://github.com/googleapis/release-please/pull/2851));
- the date.

The templates (`mainTemplate`/`commitPartial`) are not configurable via the manifest config [src: schema has no such keys], so the double blank line stays.

A longer range (manifest 0.40.0 → proposed 0.41.0) rendered Features / Bug Fixes (incl. `**ci:**` scope) / Dependencies (`**deps:** update dependency remeda …`) exactly like today. `build(deps-dev)`/`ci`/`test` stayed hidden [run].

Two differences worth knowing:

- release-please parses commits with its own parser. Some footer issue references that semantic-release listed (e.g. 0.41.0's `closes #1952 #478 …`) were not listed [run]. Cosmetic.
- **Must fix:** the CHANGELOG updater inserts the new entry before the first match of `\n###? v?[0-9[]` [src: `RP/src/updaters/changelog.ts#L22-L48`]. Our file starts with `## [0.42.0]` at offset 0, which has no leading `\n`. So the new entry would be inserted **after** 0.42.0, between 0.42.0 and 0.41.1 [run: local script on the real file]. Fix: prepend `# Changelog\n\n` once during migration. Verified that with the header, new entries go on top [run].

## 3. Hand-edited release notes (most important)

Mechanics [src]:

- Each run rebuilds the PR body from master. If the open PR's body is **byte-identical** to the new one, it does nothing: no push, no edit. [`RP/src/manifest.ts#L1094-L1106`]
- Otherwise it calls `updatePullRequest`. That rebuilds the release branch from the current master with only its own file updates and **force-pushes** it (`force: true`), then overwrites the title and body. [`RP/src/github.ts#L784-L828`]

Consequences:

| You edit…                                              | Survives a hidden-only push (chore/docs/ci/deps-dev)?                             | Survives a releasable push (feat/fix/…)? |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------- |
| files on the release branch (CHANGELOG, what's-new md) | yes (body unchanged → no push)                                                    | **no** (force-push)                      |
| the PR body                                            | **no.** Body ≠ generated → update → force-push, which **also wipes branch edits** | **no**                                   |
| files on master via normal PRs                         | yes                                                                               | yes                                      |
| a merged PR's body (`BEGIN_COMMIT_OVERRIDE`)           | yes (read on every run)                                                           | yes                                      |

Notes:

- No "leave my PR alone" option exists. The request has been open since 2021 ([#877](https://github.com/googleapis/release-please/issues/877), still open) [verified on GitHub].
- `always-update: true` makes it worse, not better. [docs: schema `always-update`]
- **GitHub release notes come from the merged release PR's body**, not from CHANGELOG.md. The body is parsed between `---` delimiters and must start with `## [x.y.z]`. [src: `RP/src/strategies/base.ts#L594-L730`, `RP/src/util/pull-request-body.ts#L155-L170`]
  - The action README's "extracted from CHANGELOG" wording for the `body` output is misleading.
  - So body and CHANGELOG can diverge if you edit only one. Recommendation: our release job overwrites the release body from the CHANGELOG.md section of the release commit (#1968's `notes`), so CHANGELOG.md is the single source.

Mechanisms that exist [docs, src]:

- **`BEGIN_COMMIT_OVERRIDE … END_COMMIT_OVERRIDE`** in a _merged_ PR's body replaces that commit's message for changelog purposes.
  - Durable, and a good way to reword or split entries.
  - Needs squash merges; we already squash, and merge commits are disabled.
  - [docs: [README "How can I fix release notes?"](https://github.com/googleapis/release-please#how-can-i-fix-release-notes); src: `RP/src/commit.ts#L457`]
- **`Release-As: x.y.z`** footer in a commit body forces the version.
  - Our squash message is the PR body (`squash_merge_commit_message: PR_BODY`), so a `Release-As:` line in a PR description works. [docs: README; repo setting via API]
- **`extra-files`** with `x-release-please-version` / `x-release-please-start-version … x-release-please-end` markers stamps the new version into any file. [docs: [customizing.md](https://github.com/googleapis/release-please/blob/main/docs/customizing.md#updating-arbitrary-files)]
- **`pull-request-header` / `pull-request-footer`** set static text only.
- **`changelog-type: github`** uses GitHub's generated notes. No curation, and it loses our sections.
- **`skip-github-pull-request`** (action input) / not running `release-pr` (CLI) lets us gate PR updates ourselves. [src: action `action.yml` v5.0.0]

Ways curated notes can coexist, most to least recommended:

1. **Curate on master, stamp in the release PR.**
   - Highlights, a what's-new md, or walkthrough content are written in normal feature/docs PRs on master. Reword changelog lines with `BEGIN_COMMIT_OVERRIDE`.
   - Files that must show the version use `x-release-please-version` markers via `extra-files`.
   - The version is decided in the release PR and written into the content by the same commit, so it can't drift.
2. **Last-minute edits + freeze label.**
   - Timon edits CHANGELOG/what's-new on the release branch right before merging, and adds a label, e.g. `release: frozen`.
   - The workflow skips `release-pr` while an open `autorelease: pending` PR carries that label.
   - Remove the label to let release-please resync, which drops the edits.
   - About 5 lines of YAML.
3. **Re-apply step (not recommended):** after `release-pr`, a job re-applies a master-hosted highlights file into the release branch's CHANGELOG on every run. More code, and it races release-please.

## 4. Bootstrap

- Manifest `{".": "0.42.0"}` + `include-component-in-tag: false` (`include-v-in-tag` defaults to true).
  - release-please found release `v0.42.0` at `58d140d` and considered the 6 commits since (docs/ci/deps-dev).
  - Result: "No user facing commits found … skipping". [run, 17.6.0 and 17.11.2]
- `bootstrap-sha` / `last-release-sha` are not needed, because the GitHub release + tag exist.
- The warning "Release SHA … did not have an associated pull request" is harmless (semantic-release pushed directly) [run].
- The release PR branch will be `release-please--branches--master--components--shellcheck`. The component comes from `package.json` `name`; the tag stays `vX.Y.Z` [run].
- The manifest can live at the repo root with default names. The CLI/action default to `release-please-config.json` and `.release-please-manifest.json`.

## 5. package.json / package-lock.json

- The `node` strategy updates `package.json` `version`, and for `package-lock.json` / `npm-shrinkwrap.json` both top-level `version` and, for lockfile v2/v3, `packages[""].version`.
  - [src: `RP/src/strategies/node.ts#L36-L73`, `RP/src/updaters/node/package-lock-json.ts#L41-L49`]
- It preserves indentation (`jsonStringify(parsed, content)`) [src].
- The dry run listed updates to `package.json`, `package-lock.json`, `CHANGELOG.md` and the manifest ("updating from 0.42.0 to …") [run].

## 6. Workflow design

Facts:

- The action runs `github-release` first, then `release-pr`. [src: action `src/index.ts` L144-L150 @v5.0.0]
- Outputs include `release_created`, `tag_name`, `version`, `sha`, `upload_url`, `prs_created`, `pr`. [src: action `src/index.ts` L180-L224]
- `draft: true` alone creates no git tag. The next run then can't find the previous release ([#2798](https://github.com/googleapis/release-please/issues/2798), [#1650](https://github.com/googleapis/release-please/issues/1650)).
- `force-tag-creation: true` creates `refs/tags/vX` via `git.createRef` before the draft release. [src: `RP/src/github-api.ts#L676-L708`; available since 17.2.0 / [#2627](https://github.com/googleapis/release-please/pull/2627), present in 17.6.0 [src at tag]]
- After tagging, release-please flips the release PR label `autorelease: pending` → `autorelease: tagged` and comments "🤖 Created releases". [src: `RP/src/manifest.ts#L1262-L1323`]

Design (push to master):

```text
test ─┐
build ┴─► release-please (github-release, then release-pr) ─► release (only on the release commit)
```

- `release-please` runs **after** `test`/`build`. A red master then never tags, and a tag never exists for an unpublished build.
- `release` does **not** trust `release_created`. It checks that _this_ commit is the release commit (`package.json` version ≠ `HEAD^`'s) and that release `v$VERSION` exists and is a draft.
  - Why: with two quick pushes A (release merge) and B, B's run may tag A's release first. `release_created` would then be true in B's run, with B's VSIXs. The version-changed check makes each release commit publish its own artifacts.
- `release` steps, all idempotent:
  1. Marketplace via `vsce-publish-with-retry.sh` (`--skip-duplicate`, securityroles retry).
  2. `ovsx publish --skip-duplicate`.
  3. `gh release upload --clobber`.
  4. `gh release edit --notes-file <CHANGELOG section>`.
  5. `gh release edit --draft=false --latest`.
  6. `announce`.
- **Re-run safety:**
  - Re-running the failed `release` job repeats idempotent steps. `announce` may post duplicate comments [unverified: whether `@semantic-release/github` `success()` dedupes].
  - If `release-please` failed after merge, re-running it tags first (`github-release` precedes `release-pr`). While a merged PR is untagged, `release-pr` refuses to open new PRs ("There are untagged, merged release PRs outstanding - aborting") [src: `RP/src/manifest.ts#L934-L940`], so it self-heals on re-run.
- **Tag push events:** release-please's tag push (made with a PAT) doesn't start `ci.yaml`, because `on.push.branches: [master]` doesn't match tag refs ([GitHub docs](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#onpushbranchestagsbranches-ignoretags-ignore)).

## 7. "released in vX" comments

- release-please only comments on and labels **the release PR itself**. It never touches the included issues/PRs. [src: `RP/src/manifest.ts#L1290-L1322`]
- Keep #1968's `scripts/release.mjs announce`: `@semantic-release/github` `success()` with `addReleases: "bottom"`.
- Commit range: `git describe --tags --abbrev=0 --match='v*' HEAD^` .. `HEAD^`. That covers everything since the previous release tag, excluding the release commit (which release-please tagged). This is what #1968 already does. It needs `fetch-depth: 0` + tags.

## 8. Tokens

- PRs and pushes made with `GITHUB_TOKEN` trigger no workflows, so the release PR would have no CI. Use a PAT (`GH_TOKEN_SEMANTIC_RELEASE`) or a GitHub App token. [docs: [action README](https://github.com/googleapis/release-please-action#github-credentials)]
- The token needs contents:write, pull-requests:write, issues:write (labels) [docs].
- Tags/releases made with `GITHUB_TOKEN` would be fine for us: nothing listens to `release`/tag events, and publishing happens in the same run.
- **[unverified]** Branch protection couldn't be read (403). With a PAT owned by Timon, the release PR is authored by Timon, and he can't approve his own PR if reviews are required. A GitHub App token (`actions/create-github-app-token`) avoids that.

## 9. PR title

- `validate-pr-title.yaml` uses `amannn/action-semantic-pull-request@v6` with defaults: types from `conventional-commit-types` (includes `chore`), no scope rules. [src: amannn `action.yml`, `src/validatePrTitle.js`]
- The default `chore(master): release 0.43.0` passes.
- **Recommend `"pull-request-title-pattern": "chore(release): ${version}"`.** It matches the existing `chore(release): 0.42.0` history, and release-please parses it back correctly on merge.
  - [run: title `chore(release): 0.42.0`]
  - The warnings about missing `${scope}`/`${component}` are harmless [src: `RP/src/util/pull-request-title.ts#L25-L40`].
- Squash title = PR title, so the release commit is `chore(release): 0.43.0 (#N)`.

## 10. Version override and "hold"

- **Force a version:** merge any PR whose description ends with `Release-As: 1.0.0`, or push an empty commit with that footer. The newest `Release-As` wins. [src/docs]
  - The config key `release-as` is deprecated.
  - The action input `release-as` is reportedly ignored in manifest mode ([action #1220](https://github.com/googleapis/release-please-action/issues/1220), open).
- **Hold:** just don't merge. Gotchas:
  - **Every releasable push force-pushes the release branch**, which re-runs the full PR CI (6 test + 10 build jobs).
  - **Hidden-only pushes leave the branch stale.** The PR diff only touches version lines/CHANGELOG/manifest, so squash-merge rarely conflicts; a conflict would come from someone else editing `package.json` `version` or CHANGELOG. The published VSIX is built from the merged commit, so it includes those hidden commits (same as today).
  - **Merge only after the latest master run's `release-please` job has finished.** Otherwise a releasable commit that landed just before the merge ships without a CHANGELOG line. Nothing records it later either, because it predates the release SHA.
  - Don't remove `autorelease: pending`. Closing the PR without merging just makes release-please open a new one on the next releasable push (unless it's labelled `autorelease: snoozed`) [src: `RP/src/manifest.ts#L1006-L1036`].

## 11. Maintenance and pitfalls

| Item                       | Status                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-please` (lib/CLI) | v17.11.2, 2026-08-24; commits through 2026-09-14; ~365 open issues; Google teams own it. [[releases](https://github.com/googleapis/release-please/releases)]                                                                                                                                                              |
| `release-please-action`    | v5.0.0, 2026-04-22, bundles lib **17.6.0**. `main` has 17.6.1 but is unreleased: the release PR [#1209](https://github.com/googleapis/release-please-action/pull/1209) has been open since 2026-05-27, and the bump to 17.11.2 ([#1224](https://github.com/googleapis/release-please-action/pull/1224)) since 2026-08-28. |

Pitfalls relevant to us:

- **17.6.x writes `, closes #N`** into the release PR body. Merging the PR then makes GitHub auto-close every referenced issue, including ones only mentioned (e.g. the open web-support issue #478 was referenced by #1954). Fixed in 17.10.4 ([#2851](https://github.com/googleapis/release-please/pull/2851)).
  - This is the main reason to run the **CLI pinned to 17.11.2** instead of the action. Our `release` job doesn't need action outputs.
- `draft: true` without a tag breaks the next run ([#2798](https://github.com/googleapis/release-please/issues/2798)). Use `force-tag-creation: true`.
- "Untagged, merged release PRs outstanding": if tagging fails, no new release PR appears until it's fixed ([#1946](https://github.com/googleapis/release-please/issues/1946)).
- Spurious force-pushes when nothing changed ([#2881](https://github.com/googleapis/release-please/issues/2881)) were closed. The fix PR [#2882](https://github.com/googleapis/release-please/pull/2882) was closed **unmerged**. The body-equality check still prevents pushes for hidden-only commits [src], but CRLF/whitespace body normalization by GitHub could in theory cause extra force-pushes [unverified for our repo].
- Lockfile bugs reported by others are all for monorepos/workspaces ([#1993](https://github.com/googleapis/release-please/issues/1993)). They don't apply to our single package.

## Implementation plan

### Add

- `release-please-config.json` (root). Same as [`docs/plans/release-please/release-please-config.json`](release-please/release-please-config.json):
  - `release-type: node`
  - `include-component-in-tag: false`
  - `pull-request-title-pattern: "chore(release): ${version}"`
  - `draft: true`
  - `force-tag-creation: true`
  - the six `changelog-sections` (incl. `build`+`scope: deps`)
  - optional `extra-files` for version-stamped what's-new content
- `.release-please-manifest.json` (root), multi-line so Prettier keeps it stable:

  ```json
  {
    ".": "0.42.0"
  }
  ```

- `CHANGELOG.md`: prepend `# Changelog` + blank line (one-time).
- `renovate.json`: a regex `customManagers` entry to bump the pinned `release-please@x.y.z` in `ci.yaml` (datasource `npm`). No `semanticCommitType` changes.
- `ci.yaml`, jobs sketched below.

```yaml
release-please:
  if: github.event_name == 'push'
  needs: [test, build]
  runs-on: ubuntu-latest
  concurrency: release-please
  steps:
    - name: Tag merged release PR, then open/update the release PR
      run: |
        npx --yes release-please@17.11.2 github-release --token "$TOKEN" --repo-url "$GITHUB_REPOSITORY"
        # Hold curated edits: skip PR sync while the release PR is labelled `release: frozen`
        if [ -z "$(gh pr list --label 'autorelease: pending' --label 'release: frozen' --json number --jq '.[].number')" ]; then
          npx --yes release-please@17.11.2 release-pr --token "$TOKEN" --repo-url "$GITHUB_REPOSITORY"
        fi
      env:
        TOKEN: ${{ secrets.GH_TOKEN_SEMANTIC_RELEASE }}
        GH_TOKEN: ${{ github.token }}

release:
  if: github.event_name == 'push'
  needs: [release-please]
  runs-on: ubuntu-latest
  concurrency: release
  permissions:
    contents: write
    issues: write
    pull-requests: write
  steps:
    - uses: actions/checkout@v7
      with: { fetch-depth: 0 }
    - id: check # release commit = version changed vs HEAD^ and a draft v$version exists
      run: |
        version=$(node -p "require('./package.json').version")
        previous=$(git show HEAD^:package.json | node -p "JSON.parse(require('fs').readFileSync(0)).version")
        [ "$version" != "$previous" ] || exit 0
        echo "version=$version" >> "$GITHUB_OUTPUT"
        echo "release=true" >> "$GITHUB_OUTPUT"
      env: { GH_TOKEN: "${{ github.token }}" }
    # when release=true: download VSIX artifacts, mise, npm ci (BINDL_SKIP), npm audit signatures, then:
    #   bash .github/scripts/vsce-publish-with-retry.sh          (VSCE_PAT)
    #   npx ovsx publish --skip-duplicate --packagePath *.vsix   (OVSX_PAT)
    #   gh release upload "v$VERSION" *.vsix --clobber
    #   node scripts/release.mjs notes "$VERSION" > notes.md && gh release edit "v$VERSION" --notes-file notes.md
    #   gh release edit "v$VERSION" --draft=false --latest
    #   node scripts/release.mjs announce "$(gh api repos/$GITHUB_REPOSITORY/releases/tags/v$VERSION --jq .id)"
```

(`gh release upload`/`edit` fail loudly if release-please didn't create the draft. The fix is to re-run failed jobs.)

### Keep from #1968

- `build` job: plain `vsce package [--target …]` with no write permissions, so PR builds produce VSIXs.
- `.github/scripts/vsce-publish-with-retry.sh` (securityroles retry, `--skip-duplicate`).
- The Open VSX step, `concurrency: release`, `fetch-depth: 0`.
- `scripts/release.mjs`: `notes` and `announce` only, plus their tests in `scripts/release.test.mjs`.
- devDeps `@vscode/vsce`, `ovsx`, `@semantic-release/github`.
- Removal of `semantic-release`, `semantic-release-vsce`, `semantic-release-stop-before-publish`, `@semantic-release/changelog`, `@semantic-release/git`, and the three `*.release.config.js` files.
- `.prettierignore` still ignores `CHANGELOG.md`. Update the comment to "generated by release-please".

### Drop from #1968

- `.github/workflows/prepare-release.yaml`
- `release.mjs prepare` and its tests
- devDeps `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `conventional-changelog-conventionalcommits`

### Rollout check

After merging the migration PR (a `ci:` commit, which is hidden), confirm the first `release-please` run logs "Found release for path ., v0.42.0" and opens nothing. Then the next `feat`/`fix` opens `chore(release): 0.42.1/0.43.0`.

## Open decisions for Timon

1. **Curated notes model:** (1) curate on master + `extra-files` stamping + `BEGIN_COMMIT_OVERRIDE` (recommended), or (2) also allow last-minute branch edits with the `release: frozen` gate?
2. **CLI pinned to 17.11.2 (recommended) vs action v5.0.0.** The action is simpler and has typed outputs, but ships the `closes #N` auto-close bug until a new action release.
3. **Token:** keep the `GH_TOKEN_SEMANTIC_RELEASE` PAT (the release PR is authored by the PAT owner, which may block self-approval) or create a GitHub App token?
4. **Release PR title:** `chore(release): ${version}` (recommended) vs the default `chore(master): release ${version}`.
5. **Accept the cosmetic CHANGELOG differences** (double blank lines, `refs` instead of `closes`)?
6. **What happens to #1968:** close it, or rework its branch into this plan (much of its `ci.yaml`/script work carries over)?
