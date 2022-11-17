const common = require("./common.release.config.js");

module.exports = {
  ...common,
  plugins: [
    ...common.plugins,
    [
      "semantic-release-vsce",
      {
        packageVsix: false,
        publishPackagePath: "*/*.vsix",
      },
    ],
    "@semantic-release/git",
    [
      "@semantic-release/github",
      {
        assets: "*/*.vsix",
        addReleases: "bottom",
      },
    ],
  ],
};
