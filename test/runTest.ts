import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--new-window", "--disable-extensions"],
      // Use VSCODE_TEST_VERSION if set
      ...(process.env.VSCODE_TEST_VERSION
        ? { version: process.env.VSCODE_TEST_VERSION }
        : {}),
    });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
