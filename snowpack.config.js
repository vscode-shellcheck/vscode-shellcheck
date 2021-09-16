// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    src: "/",
    test: "/test",
  },
  plugins: [
    ["@snowpack/plugin-typescript" /* { tsc: "tsc", args: "--project ." } */],
  ],
  packageOptions: {
    knownEntrypoints: ["src/extension.ts"],
    external: ["vscode", ...require("module").builtinModules],
  },
  buildOptions: {
    out: "dist",
    sourcemap: true,
  },
  ...(process.env.NODE_ENV === "production"
    ? {
        optimize: {
          bundle: true,
          minify: true,
          sourcemap: false,
          entrypoints: ["src/extension.ts"],
        },
      }
    : {}),

  testOptions: { files: ["test/**/*"] },
};
