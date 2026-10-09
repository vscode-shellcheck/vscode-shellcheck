// @ts-check

import { globalIgnores } from "eslint/config";
import { neostandard, resolveIgnoresFromGitignore } from "neostandard";

const ignores = resolveIgnoresFromGitignore();

export default [
  // neostandard 0.14 scopes `ignores` to its file patterns, so they no longer
  // skip walking the tree. A global ignore still does; without it, `eslint .`
  // after `npm test` enters `.vscode-test` (a full VS Code download) and OOMs.
  globalIgnores(ignores),
  ...neostandard({
    ignores,
    noStyle: true,
    ts: true,
  }),
];
