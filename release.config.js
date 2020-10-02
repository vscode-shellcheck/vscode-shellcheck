module.exports = {
    plugins: [
        [
            "@semantic-release/commit-analyzer",
            {
                releaseRules: [
                    {
                        type: "refactor",
                        release: "patch",
                    },
                    {
                        type: "build",
                        scope: "deps",
                        release: "patch",
                    },
                ],
            },
        ],
        "@semantic-release/release-notes-generator",
        "@semantic-release/changelog",
        [
            "@felipecrs/semantic-release-vsce",
            {
                packageVsix: true,
                yarn: true,
            },
        ],
        "@semantic-release/git",
        [
            "@semantic-release/github",
            {
                assets: "*.vsix",
                addReleases: "bottom"
            },
        ],
    ],
    preset: "conventionalcommits",
};
