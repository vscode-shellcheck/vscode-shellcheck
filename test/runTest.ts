import { runTests } from "@vscode/test-electron";
import { fileURLToPath } from "node:url";

async function main() {
  try {
    const extensionDevelopmentPath = fileURLToPath(
      new URL("../../", import.meta.url),
    );
    const extensionTestsPath = fileURLToPath(
      new URL("./index.js", import.meta.url),
    );

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
