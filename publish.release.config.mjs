import common from "./common.release.config.mjs";

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  ...common,
  plugins: [
    ...common.plugins,
    [
      "semantic-release-vsce",
      {
        packageVsix: false,
        publishPackagePath: "*.vsix",
      },
    ],
    "@semantic-release/git",
    [
      "@semantic-release/github",
      {
        assets: "*.vsix",
        addReleases: "bottom",
      },
    ],
  ],
};
