// @ts-check

import { context } from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "esm",
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: "node",
  // The ShellCheck wasm package is GPL and the extension is MIT: shipped as
  // its own package under node_modules it is mere aggregation, bundled into
  // dist/ it would make the bundle a derivative work. It also resolves the
  // .wasm relative to its own import.meta.url, which only holds for the
  // package's real files.
  external: [
    "vscode",
    "@vscode-shellcheck/shellcheck-wasm",
    "@vscode-shellcheck/shellcheck-wasm/*",
  ],
  logLevel: "warning",
  banner: {
    // https://github.com/microsoft/vscode/issues/130367#issuecomment-2832464097
    js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
};

async function main() {
  const contexts = await Promise.all([
    context({
      ...common,
      entryPoints: ["src/extension.ts"],
      outfile: "dist/extension.js",
      plugins: [
        /* add to the end of plugins array */
        esbuildProblemMatcherPlugin,
      ],
    }),
    // The worker is the only code that runs the guest; the extension bundle
    // reaches the package solely through a dynamic import on the wasm path,
    // so the native runtime never loads any of it. "vscode" is listed as
    // external defensively: the worker has no extension host to import it
    // from.
    context({
      ...common,
      entryPoints: ["src/runtime/wasm/worker.ts"],
      outfile: "dist/wasm-worker.js",
    }),
  ]);

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(
      contexts.map(async (ctx) => {
        await ctx.rebuild();
        await ctx.dispose();
      }),
    );
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
