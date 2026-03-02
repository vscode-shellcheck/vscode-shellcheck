import { Glob } from "glob";
import Mocha from "mocha";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// @ts-expect-error
import mochaEsmUtils from "mocha/lib/nodejs/esm-utils.js";

// https://github.com/mochajs/mocha/issues/5599#issuecomment-3982072912
mochaEsmUtils.requireOrImport = async (file: string) => {
  const { default: def, ...rest } = (await mochaEsmUtils.doImport(
    pathToFileURL(file),
  )) as Record<string, unknown>;
  return def ?? rest;
};

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
  });

  const testsRoot = import.meta.dirname;

  // Add files to the test suite
  for await (const file of new Glob("**/**.test.js", { cwd: testsRoot })) {
    mocha.addFile(resolve(testsRoot, file));
  }

  await mocha.loadFilesAsync();

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
