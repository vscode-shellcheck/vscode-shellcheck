import Mocha from "mocha";
import { Glob } from "glob";
import { resolve } from "node:path";

interface MochaFixed extends Mocha {
  lazyLoadFiles(enable: boolean): void;
  loadFilesAsync(options?: object): Promise<void>;
}

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
  }) as MochaFixed;

  const testsRoot = import.meta.dirname;

  // Add files to the test suite
  for await (const file of new Glob("**/**.test.js", { cwd: testsRoot })) {
    mocha.addFile(resolve(testsRoot, file));
  }

  mocha.lazyLoadFiles(true);
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
