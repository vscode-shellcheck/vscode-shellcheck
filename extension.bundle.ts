/**
 * This is the external face of extension.bundle.js, the main webpack bundle for the extension.
 * Anything needing to be exposed outside of the extension sources must be exported from here, because
 * everything else will be in private modules in extension.bundle.js.
 */

// Export activate/deactivate for main.js
export { activateInternal, deactivateInternal } from "./src/extension";
