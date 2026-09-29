import "mocha/mocha.js";

export async function run(): Promise<void> {
  // The browser build defaults to the HTML reporter, which needs a DOM.
  mocha.setup({ ui: "tdd", reporter: "spec", timeout: 60_000 });
  await import("./suite.js");
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} web tests failed`)) : resolve(),
    );
  });
}
