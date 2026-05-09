import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: process.env.VSCODE_TEST_VERSION ?? "stable",
  launchArgs: ["--new-window", "--disable-extensions"],
  mocha: {
    ui: "tdd",
    timeout: 10000,
  },
});
