import { NativeRuntime } from "./types.js";

/** No shellcheck program can run in a browser. */
export const nativeRuntime: NativeRuntime | undefined = undefined;
