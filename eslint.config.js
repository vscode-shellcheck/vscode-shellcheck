// @ts-check

import { neostandard, resolveIgnoresFromGitignore } from "neostandard";

const ignores = resolveIgnoresFromGitignore();

export default [
  // neostandard 0.14 scopes `ignores` to its JS/TS file patterns, so they no
  // longer skip walking the tree. A lone `ignores` object is a global ignore;
  // without it, `eslint .` after `npm test` enters `.vscode-test` (a full VS
  // Code download) and OOMs.
  { ignores },
  ...neostandard({
    ignores,
    noStyle: true,
    ts: true,
  }),
];
