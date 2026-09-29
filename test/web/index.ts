/*
 * The web build can break if a Node module enters its graph, a GPL module is
 * bundled, import.meta survives in CommonJS, the worker URL is wrong, or the
 * host lacks cross-origin isolation. Esbuild and desktop bundle tests guard
 * the first three; platform tests guard the worker URL and COI requirement.
 */
import "mocha/mocha.js";

export async function run(): Promise<void> {
  mocha.setup({ ui: "tdd", reporter: undefined, timeout: 60_000 });
  await import("./web-extension.test.js");
  return await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(
          new Error(`${failures} web test${failures === 1 ? "" : "s"} failed`),
        );
      } else {
        resolve();
      }
    });
  });
}
