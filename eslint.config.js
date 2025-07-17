// @ts-check

import neostandard, { resolveIgnoresFromGitignore } from "neostandard";

export default neostandard({
  ignores: resolveIgnoresFromGitignore(),
  noStyle: true,
  ts: true,
});
