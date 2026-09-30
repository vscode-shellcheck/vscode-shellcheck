export async function run(): Promise<void> {
  // Loaded here, not at the top: evaluating mocha's browser build while this
  // bundle loads left the extension host calling mocha's own `run`, not this
  // one.
  await import("mocha/mocha.js");
  // The browser build defaults to the HTML reporter, which needs a DOM.
  mocha.setup({ ui: "tdd", reporter: "spec", timeout: 60_000 });
  await import("./suite.js");
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} web tests failed`)) : resolve(),
    );
  });
}
