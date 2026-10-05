// Runs the Workspace Trust suite in Restricted Mode. @vscode/test-electron
// always launches with `--disable-workspace-trust`, which trusts every
// workspace, so this launches VS Code itself.
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

const root = path.resolve(import.meta.dirname, "../..");
// Fresh each run: the user data remembers the folders a user trusted.
const userDataDir = path.join(root, ".vscode-test/user-data-trust");
await rm(userDataDir, { recursive: true, force: true });
await mkdir(path.join(userDataDir, "User"), { recursive: true });
await writeFile(
  path.join(userDataDir, "User/settings.json"),
  // Without it the trust dialog blocks the run instead of opening the folder
  // in Restricted Mode.
  JSON.stringify({ "security.workspace.trust.startupPrompt": "never" }),
);

const executable = await downloadAndUnzipVSCode(
  process.env.VSCODE_TEST_VERSION ?? "stable",
);
const child = spawn(
  executable,
  [
    // @vscode/test-electron's defaults less `--disable-workspace-trust`, then
    // the `launchArgs` of .vscode-test.js.
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    "--no-cached-data",
    "--new-window",
    "--disable-extensions",
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${path.join(root, ".vscode-test/extensions")}`,
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${path.join(root, "test/workspace-trust/index.cjs")}`,
    path.join(root, "test/fixtures/workspace-trust"),
  ],
  { stdio: "inherit" },
);
const exitCode = await new Promise((resolve) => child.on("close", resolve));
process.exit(exitCode ?? 1);
