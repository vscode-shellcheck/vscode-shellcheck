import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  version: process.env.VSCODE_TEST_VERSION ?? "stable",
  files: "out/test/**/*.test.js",
  launchArgs: ["--new-window", "--disable-extensions"],
  // extensionDevelopmentPath: "out",
});
