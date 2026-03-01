import { runTests } from "@vscode/test-electron";
import { resolve } from "node:path";

async function main() {
  try {
    const extensionDevelopmentPath = resolve(import.meta.dirname, "../..");
    const extensionTestsPath = resolve(import.meta.dirname, "./index.js");

    const version = process.env.VSCODE_TEST_VERSION ?? "stable";

    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--new-window", "--disable-extensions"],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
