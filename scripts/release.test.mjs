import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { announceRelease, prepareRelease, releaseNotes } from "./release.mjs";

const OLD_CHANGELOG = `## [1.2.3](https://github.com/o/r/compare/v1.2.2...v1.2.3) (2026-01-01)

### Bug Fixes

* old fix
`;

let cwd;

function git(...args) {
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
    { cwd, encoding: "utf8" },
  );
}

function commit(message) {
  git("commit", "--allow-empty", "-m", message);
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(cwd, file), "utf8"));
}

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "release-test-"));
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify(
      {
        name: "ext",
        publisher: "pub",
        version: "1.2.3",
        repository: { type: "git", url: "https://github.com/o/r.git" },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(cwd, "package-lock.json"),
    JSON.stringify(
      {
        name: "ext",
        version: "1.2.3",
        packages: { "": { name: "ext", version: "1.2.3" } },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(path.join(cwd, "CHANGELOG.md"), OLD_CHANGELOG);
  git("init", "-q", "-b", "master");
  git("add", ".");
  commit("chore(release): 1.2.3");
  git("tag", "v1.2.3");
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("prepareRelease", () => {
  for (const [message, expected] of [
    ["fix: a bug", "1.2.4"],
    ["perf: faster", "1.2.4"],
    ["refactor: tidy", "1.2.4"],
    ["build(deps): bump x", "1.2.4"],
    ["feat: a feature", "1.3.0"],
    ["feat!: breaking", "2.0.0"],
  ]) {
    it(`bumps to ${expected} for "${message}"`, async () => {
      commit(message);
      const { version } = await prepareRelease({ cwd });
      assert.equal(version, expected);
    });
  }

  it("only counts commits after the current version tag", async () => {
    git("tag", "-d", "v1.2.3");
    commit("feat: already released");
    git("tag", "v1.2.3");
    commit("fix: new");
    const { version } = await prepareRelease({ cwd });
    assert.equal(version, "1.2.4");
  });

  it("updates package.json, package-lock.json and prepends CHANGELOG.md", async () => {
    commit("feat: shiny (#42)");
    await prepareRelease({ cwd });

    assert.equal((await readJson("package.json")).version, "1.3.0");
    const lock = await readJson("package-lock.json");
    assert.equal(lock.version, "1.3.0");
    assert.equal(lock.packages[""].version, "1.3.0");

    const changelog = await readFile(path.join(cwd, "CHANGELOG.md"), "utf8");
    assert.match(
      changelog,
      /^## \[1\.3\.0\]\(https:\/\/github\.com\/o\/r\/compare\/v1\.2\.3\.\.\.v1\.3\.0\) \(\d{4}-\d{2}-\d{2}\)\n\n### Features\n\n\* shiny/,
    );
    assert.ok(changelog.endsWith(`\n${OLD_CHANGELOG}`));
  });

  it("leaves non-releasable commits out of the notes", async () => {
    commit("feat: shiny");
    commit("chore: noise");
    commit("docs: words");
    const { notes } = await prepareRelease({ cwd });
    assert.doesNotMatch(notes, /noise|words/);
  });

  it("accepts an explicit version even without releasable commits", async () => {
    commit("docs: words");
    const { version } = await prepareRelease({ cwd, version: "1.5.0" });
    assert.equal(version, "1.5.0");
    assert.equal((await readJson("package.json")).version, "1.5.0");
  });

  it("fails when there is nothing to release", async () => {
    commit("chore: noise");
    await assert.rejects(prepareRelease({ cwd }), /no releasable commits/);
    assert.equal((await readJson("package.json")).version, "1.2.3");
  });

  it("fails when the explicit version is not newer", async () => {
    commit("fix: a bug");
    await assert.rejects(
      prepareRelease({ cwd, version: "1.2.3" }),
      /must be greater than 1\.2\.3/,
    );
  });

  it("fails when the explicit version is not semver", async () => {
    commit("fix: a bug");
    await assert.rejects(
      prepareRelease({ cwd, version: "v1.3" }),
      /not a valid version/,
    );
  });

  it("fails when the current version has no tag", async () => {
    git("tag", "-d", "v1.2.3");
    commit("fix: a bug");
    await assert.rejects(prepareRelease({ cwd }), /tag v1\.2\.3 not found/);
  });
});

describe("releaseNotes", () => {
  it("returns the body of the version's CHANGELOG section", async () => {
    commit("feat: shiny");
    await prepareRelease({ cwd });

    const notes = await releaseNotes({ cwd, version: "1.3.0" });
    assert.match(notes, /^### Features\n\n\* shiny/);
    assert.doesNotMatch(notes, /old fix|## \[/);

    assert.equal(
      await releaseNotes({ cwd, version: "1.2.3" }),
      "### Bug Fixes\n\n* old fix",
    );
  });

  it("fails when the version has no section", async () => {
    await assert.rejects(
      releaseNotes({ cwd, version: "9.9.9" }),
      /no CHANGELOG\.md section for 9\.9\.9/,
    );
  });
});

describe("announceRelease", () => {
  // Records GitHub API calls; every commit is associated with PR #42.
  function fakeOctokit() {
    const calls = { shas: [], requests: [] };
    class Octokit {
      async request(route, params) {
        calls.requests.push({ route, ...params });
        if (route === "GET /repos/{owner}/{repo}") {
          return {
            data: {
              full_name: "o/r",
              clone_url: "https://github.com/o/r.git",
              permissions: { push: true },
            },
          };
        }
        return { data: { html_url: "https://github.com/o/r/pull/42" } };
      }

      async graphql(query) {
        const shas = [...query.matchAll(/object\(oid: "(\w+)"\)/g)].map(
          (m) => m[1],
        );
        calls.shas.push(...shas);
        const pr = {
          __typename: "PullRequest",
          number: 42,
          body: "",
          url: "https://github.com/o/r/pull/42",
        };
        return {
          repository: Object.fromEntries(
            shas.map((sha) => [
              `commit${sha.slice(0, 12)}`,
              {
                associatedPullRequests: {
                  nodes: [pr],
                  pageInfo: { hasNextPage: false },
                },
              },
            ]),
          ),
        };
      }

      async paginate() {
        return calls.shas.map((sha) => ({ sha }));
      }
    }
    return { calls, Octokit };
  }

  async function release(message) {
    commit(message);
    await prepareRelease({ cwd });
    git("commit", "-am", "chore(release): 1.3.0");
    git("tag", "v1.3.0");
  }

  it("comments on the released PRs and links the registries", async () => {
    commit("feat: before");
    git("tag", "-f", "v1.2.3");
    await release("feat: shiny");
    const shiny = git("rev-parse", "HEAD^").trim();
    const { calls, Octokit } = fakeOctokit();

    await announceRelease({
      cwd,
      releaseId: 99,
      env: { GITHUB_TOKEN: "t" },
      Octokit,
    });

    assert.deepEqual(calls.shas, [shiny]);

    const comment = calls.requests.find(
      (r) =>
        r.route === "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    );
    assert.equal(comment.issue_number, 42);
    assert.match(comment.body, /This PR is included in version 1\.3\.0/);
    assert.match(
      comment.body,
      /\[GitHub release\]\(https:\/\/github\.com\/o\/r\/releases\/tag\/v1\.3\.0\)/,
    );

    const labels = calls.requests.find(
      (r) =>
        r.route === "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
    );
    assert.deepEqual(labels.data, ["released"]);

    const patch = calls.requests.find(
      (r) => r.route === "PATCH /repos/{owner}/{repo}/releases/{release_id}",
    );
    assert.equal(patch.release_id, 99);
    assert.equal(
      patch.body,
      `${await releaseNotes({ cwd, version: "1.3.0" })}
---
This release is also available on:
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=pub.ext)
- [Open VSX Registry](https://open-vsx.org/extension/pub/ext/1.3.0)`,
    );
  });
});
