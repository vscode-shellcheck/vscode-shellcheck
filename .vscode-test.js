import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "@vscode/test-cli";
import { runVSCodeCommand } from "@vscode/test-electron";

const version = process.env.VSCODE_TEST_VERSION ?? "stable";
const launchArgs = ["--new-window", "--disable-extensions"];

const languagePack = "ms-ceintl.vscode-language-pack-zh-hans";
// Its own user data, so the other labels keep English even when the machine's
// argv.json picks a display language.
const zhCnUserData = path.resolve(".vscode-test/user-data-zh-cn");

/**
 * VS Code only switches to a display language whose pack is listed in the
 * user data's `languagepacks.json`, which installing a pack from the command
 * line, as `installExtensions` does, leaves out.
 */
async function installLanguagePack() {
  await runVSCodeCommand(["--install-extension", languagePack], { version });
  const location = (
    await runVSCodeCommand(["--locate-extension", languagePack], { version })
  ).stdout.trim();
  const manifest = JSON.parse(
    await readFile(path.join(location, "package.json"), "utf8"),
  );
  const languagePacks = Object.fromEntries(
    manifest.contributes.localizations.map((localization) => [
      localization.languageId,
      {
        hash: manifest.version,
        extensions: [
          {
            extensionIdentifier: { id: languagePack },
            version: manifest.version,
          },
        ],
        translations: Object.fromEntries(
          localization.translations.map((translation) => [
            translation.id,
            path.join(location, translation.path),
          ]),
        ),
        label: localization.localizedLanguageName,
      },
    ]),
  );
  await mkdir(zhCnUserData, { recursive: true });
  await writeFile(
    path.join(zhCnUserData, "languagepacks.json"),
    JSON.stringify(languagePacks),
  );
}

// Opt-in: it installs a language pack first, and one run proves the
// translations load, so CI runs it in a single job.
const l10n = Boolean(process.env.VSCODE_TEST_L10N);
if (l10n) {
  await installLanguagePack();
}

export default defineConfig([
  {
    label: "integration",
    // Everything except the suites that need the workspace folders or the
    // display language the entries below set up, and the Workspace Trust
    // suite, which `npm run test:workspace-trust` runs.
    files: "out/test/**/!(parity|rc-watch|l10n|workspace-trust).test.js",
    version,
    launchArgs,
    mocha: {
      ui: "tdd",
      timeout: 10000,
    },
  },
  {
    label: "parity",
    files: "out/test/parity.test.js",
    version,
    launchArgs,
    // The wasm runtime maps the document's workspace folder as its preopen
    // root, so the fixtures' `.shellcheckrc` and `source` targets are only
    // reachable to it with a folder open.
    workspaceFolder: "test/fixtures/wasm-parity",
    mocha: {
      ui: "tdd",
      // A parity case pays for two runtime switches and a wasm cold start on
      // top of the lint itself.
      timeout: 30000,
    },
  },
  {
    label: "rc-watch",
    files: "out/test/rc-watch.test.js",
    version,
    launchArgs,
    // The workspace watcher needs a folder open, and the folder above it holds
    // the rc file that stands in for one outside the workspace.
    workspaceFolder: "test/fixtures/rc-watch/workspace",
    mocha: {
      ui: "tdd",
      timeout: 10000,
    },
  },
  ...(l10n
    ? [
        {
          label: "l10n-zh-cn",
          files: "out/test/l10n.test.js",
          version,
          // Extension translations only load in a display language other than
          // English.
          launchArgs: [
            ...launchArgs,
            "--locale",
            "zh-cn",
            `--user-data-dir=${zhCnUserData}`,
          ],
          mocha: {
            ui: "tdd",
            timeout: 10000,
          },
        },
      ]
    : []),
]);
