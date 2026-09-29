import "mocha/mocha.js";

export async function run(): Promise<void> {
  mocha.setup({ ui: "tdd", reporter: undefined, timeout: 60_000 });
  await import("./suite.js");
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} web tests failed`)) : resolve(),
    );
  });
}
