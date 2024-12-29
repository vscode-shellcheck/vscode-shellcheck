/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        releaseRules: [
          {
            type: "perf",
            release: "patch",
          },
          {
            type: "refactor",
            release: "patch",
          },
          {
            type: "build",
            scope: "deps",
            release: "patch",
          },
          // https://github.com/semantic-release/commit-analyzer/issues/413#issuecomment-1465299187
          {
            breaking: true,
            release: "major",
          },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        presetConfig: {
          types: [
            {
              type: "feat",
              section: "Features",
            },
            {
              type: "fix",
              section: "Bug Fixes",
            },
            {
              type: "perf",
              section: "Performance Improvements",
            },
            {
              type: "revert",
              section: "Reverts",
            },
            {
              type: "refactor",
              section: "Code Refactoring",
            },
            {
              type: "build",
              scope: "deps",
              section: "Dependencies",
            },
          ],
        },
      },
    ],
    "@semantic-release/changelog",
  ],
  preset: "conventionalcommits",
};
