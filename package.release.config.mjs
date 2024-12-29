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
        packageVsix: true,
      },
    ],
    "semantic-release-stop-before-publish",
  ],
};
