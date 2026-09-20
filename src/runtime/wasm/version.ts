import { SemVer } from "semver";
import { version } from "../../../bindl.config.js";

/**
 * ShellCheck version inside the bundled wasm module. The module is built from
 * the same upstream release the native binaries are pinned to, and
 * `scripts/fetch-wasm.mjs` reads that pin from the same place, so the two
 * cannot drift apart.
 */
export const WASM_TOOL_VERSION: SemVer = new SemVer(version);
