import { resolve as pathResolve } from "node:path";
import Mocha from "mocha";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
  });

  // ESM - enable async file loading
  (mocha as any).lazyLoadFiles(true);

  // ESM use import.meta and URL-path instead of __dirname
  const testsRoot = fileURLToPath(new URL(".", import.meta.url));

  return new Promise((resolve, reject) => {
    try {
      const files = globSync("**/**.test.js", { cwd: testsRoot });

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(pathResolve(testsRoot, f)));

      // ESM - kick off async file loading
      (mocha as any)
        .loadFilesAsync()
        .then(() => {
          mocha.run((failures) => {
            if (failures > 0) {
              reject(new Error(`${failures} tests failed.`));
            } else {
              resolve();
            }
          });
        })
        .catch((err: any) => {
          console.error("loadFilesAsync failed!", err);
          reject(err);
        });

      // Run the mocha test
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
