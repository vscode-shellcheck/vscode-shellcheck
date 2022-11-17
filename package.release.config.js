const common = require("./common.release.config.js");

module.exports = {
  ...common,
  plugins: [
    ...common.plugins,
    [
      "semantic-release-vsce",
      {
        packageVsix: true,
      },
    ],
    "semantic-release-stop-before-publish",
  ],
};
