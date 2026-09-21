// Aliased: esbuild hoists this import into the bundle, whose banner already
// declares a `createRequire` binding.
import { createRequire as createNodeRequire } from "node:module";
import { SemVer } from "semver";

export interface WasmBuildInfo {
  /** The ShellCheck release compiled into the package's module. */
  readonly shellcheckVersion: SemVer;
  readonly ghcVersion: string;
}

interface PackagedBuildInfo {
  readonly shellcheckVersion: string;
  readonly ghcVersion: string;
}

const require = createNodeRequire(import.meta.url);

/**
 * Read off disk rather than imported: an import of the package, even for a
 * constant, would hoist its module graph into the extension bundle, and only
 * `build-info.json` carries the GHC version.
 */
export function readWasmBuildInfo(): WasmBuildInfo {
  const info =
    require("@vscode-shellcheck/shellcheck-wasm/build-info.json") as PackagedBuildInfo;
  return {
    shellcheckVersion: new SemVer(info.shellcheckVersion),
    ghcVersion: info.ghcVersion,
  };
}
