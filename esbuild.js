// @ts-check

import { context } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const nodeCommon = {
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
      ...nodeCommon,
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
      ...nodeCommon,
      entryPoints: ["src/runtime/wasm/worker.ts"],
      outfile: "dist/wasm-worker.js",
    }),
    context({
      entryPoints: ["src/extension.ts"],
      outfile: "dist/web/extension.js",
      bundle: true,
      format: "cjs",
      platform: "browser",
      target: "es2022",
      external: ["vscode"],
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      logLevel: "warning",
      plugins: [webTwinPlugin, gplGuardPlugin, esbuildProblemMatcherPlugin],
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
 * Resolves a relative import of `x.js` to `x.web.ts` wherever that twin
 * exists, which is how the web entry drops every Node-only module.
 *
 * @type {import('esbuild').Plugin}
 */
const webTwinPlugin = {
  name: "web-twin",
  setup(build) {
    build.onResolve({ filter: /^\.\.?\/.*\.js$/ }, (args) => {
      const twin = path
        .resolve(args.resolveDir, args.path)
        .replace(/\.js$/, ".web.ts");
      return existsSync(twin) ? { path: twin } : undefined;
    });
  },
};

/**
 * The web entry is one MIT file, so only the package's MIT client may be
 * bundled into it; the GPL worker is started from its own file instead.
 *
 * @type {import('esbuild').Plugin}
 */
const gplGuardPlugin = {
  name: "gpl-guard",
  setup(build) {
    build.onResolve(
      { filter: /^@vscode-shellcheck\/shellcheck-wasm/ },
      (args) =>
        args.path === "@vscode-shellcheck/shellcheck-wasm/client"
          ? undefined
          : {
              errors: [
                {
                  text: `The web extension may only bundle @vscode-shellcheck/shellcheck-wasm/client, not ${args.path}`,
                },
              ],
            },
    );
  },
};

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
