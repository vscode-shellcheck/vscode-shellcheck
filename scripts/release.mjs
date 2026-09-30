// Release PR helper: `prepare [version]` bumps the version and prepends the
// CHANGELOG from conventional commits since the current version's tag;
// `notes <version>` prints that version's CHANGELOG section for the GitHub
// release; `announce <release-id>` comments on the released issues and PRs.
// Versioning happens in the PR so hand-written release content and the
// version it ships in are reviewed together.

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { success } from "@semantic-release/github";
import { generateNotes } from "@semantic-release/release-notes-generator";
import semver from "semver";

const preset = "conventionalcommits";

const releaseRules = [
  { type: "perf", release: "patch" },
  { type: "refactor", release: "patch" },
  { type: "build", scope: "deps", release: "patch" },
  // https://github.com/semantic-release/commit-analyzer/issues/413#issuecomment-1465299187
  { breaking: true, release: "major" },
];

const presetConfig = {
  types: [
    { type: "feat", section: "Features" },
    { type: "fix", section: "Bug Fixes" },
    { type: "perf", section: "Performance Improvements" },
    { type: "revert", section: "Reverts" },
    { type: "refactor", section: "Code Refactoring" },
    { type: "build", scope: "deps", section: "Dependencies" },
  ],
};

const logger = { log() {}, error: console.error };

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function readJson(cwd, file) {
  return JSON.parse(await readFile(path.join(cwd, file), "utf8"));
}

async function writeJson(cwd, file, data) {
  await writeFile(path.join(cwd, file), JSON.stringify(data, null, 2) + "\n");
}

function commitsSince(cwd, tag, head = "HEAD") {
  try {
    git(cwd, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
  } catch {
    throw new Error(`tag ${tag} not found; fetch tags or fix package.json`);
  }
  return git(cwd, "log", "--format=%H%x1f%B%x1e", `${tag}..${head}`)
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, message] = entry.split("\x1f");
      return { hash, message };
    });
}

export async function prepareRelease({ cwd, version }) {
  const pkg = await readJson(cwd, "package.json");
  const lastRelease = { version: pkg.version, gitTag: `v${pkg.version}` };
  const commits = commitsSince(cwd, lastRelease.gitTag);
  const context = { cwd, commits, logger, lastRelease };

  if (version) {
    if (!semver.valid(version)) {
      throw new Error(`${version} is not a valid version`);
    }
    if (!semver.gt(version, pkg.version)) {
      throw new Error(`${version} must be greater than ${pkg.version}`);
    }
  } else {
    const type = await analyzeCommits({ preset, releaseRules }, context);
    if (!type) {
      throw new Error(
        `no releasable commits since ${lastRelease.gitTag}; pass a version to release anyway`,
      );
    }
    version = semver.inc(pkg.version, type);
  }

  const notes = await generateNotes(
    { preset, presetConfig },
    {
      ...context,
      nextRelease: { version, gitTag: `v${version}` },
      options: { repositoryUrl: pkg.repository.url },
    },
  );

  pkg.version = version;
  await writeJson(cwd, "package.json", pkg);
  const lock = await readJson(cwd, "package-lock.json");
  lock.version = version;
  lock.packages[""].version = version;
  await writeJson(cwd, "package-lock.json", lock);

  const changelogPath = path.join(cwd, "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  await writeFile(changelogPath, `${notes.trim()}\n\n${changelog}`);

  return { version, notes };
}

export async function releaseNotes({ cwd, version }) {
  const changelog = await readFile(path.join(cwd, "CHANGELOG.md"), "utf8");
  const sections = changelog.split(/^(?=## )/m);
  const section = sections.find((s) => s.startsWith(`## [${version}]`));
  if (!section) {
    throw new Error(`no CHANGELOG.md section for ${version}`);
  }
  return section.slice(section.indexOf("\n") + 1).trim();
}

export async function announceRelease({ cwd, releaseId, env, Octokit }) {
  const pkg = await readJson(cwd, "package.json");
  const { version, publisher, name } = pkg;
  const gitTag = `v${version}`;
  // Only the commits the release PR shipped, not the release commit itself.
  const lastTag = git(
    cwd,
    "describe",
    "--tags",
    "--abbrev=0",
    "--match=v*",
    "HEAD^",
  ).trim();
  const repositoryUrl = pkg.repository.url;
  const repoPath = repositoryUrl.replace(
    /^https:\/\/github\.com\/|\.git$/g,
    "",
  );

  await success(
    { addReleases: "bottom", failCommentCondition: false },
    {
      cwd,
      env,
      logger: console,
      options: { repositoryUrl },
      commits: commitsSince(cwd, lastTag, "HEAD^"),
      nextRelease: {
        version,
        gitTag,
        notes: await releaseNotes({ cwd, version }),
      },
      releases: [
        {
          name: "GitHub release",
          id: releaseId,
          url: `https://github.com/${repoPath}/releases/tag/${gitTag}`,
        },
        {
          name: "Visual Studio Marketplace",
          url: `https://marketplace.visualstudio.com/items?itemName=${publisher}.${name}`,
        },
        {
          name: "Open VSX Registry",
          url: `https://open-vsx.org/extension/${publisher}/${name}/${version}`,
        },
      ],
    },
    Octokit && { Octokit },
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  const cwd = process.cwd();
  if (command === "prepare") {
    console.log((await prepareRelease({ cwd, version: arg })).version);
  } else if (command === "notes" && arg) {
    console.log(await releaseNotes({ cwd, version: arg }));
  } else if (command === "announce" && arg) {
    await announceRelease({ cwd, releaseId: Number(arg), env: process.env });
  } else {
    console.error(
      "usage: release.mjs prepare [version] | notes <version> | announce <release-id>",
    );
    process.exit(2);
  }
}
