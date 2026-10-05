// The extension host loads `--extensionTestsPath` as CommonJS.
const path = require("node:path");

exports.run = async function run() {
  // mocha is ESM only, and requiring it yields its namespace on the Node of
  // older VS Code versions.
  const { default: Mocha } = await import("mocha");
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 30000 });
  mocha.addFile(
    path.resolve(__dirname, "../../out/test/workspace-trust.test.js"),
  );
  await mocha.loadFilesAsync();
  await new Promise((resolve, reject) =>
    mocha.run((failures) =>
      failures
        ? reject(new Error(`${failures} Workspace Trust tests failed`))
        : resolve(),
    ),
  );
};
