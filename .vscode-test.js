import { defineConfig } from "@vscode/test-cli";

const version = process.env.VSCODE_TEST_VERSION ?? "stable";
const launchArgs = ["--new-window", "--disable-extensions"];

export default defineConfig([
  {
    label: "integration",
    // Everything except the parity suite, which needs the workspace folder the
    // entry below opens.
    files: "out/test/**/!(parity).test.js",
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
]);
