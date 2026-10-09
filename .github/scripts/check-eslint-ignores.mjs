// ESLint only skips a directory when it is a global ignore: a config whose
// only key is `ignores`. neostandard 0.14 scopes ignores to its file
// patterns, which still walks gitignored trees. After `npm test` those
// include `.vscode-test` (a full VS Code download), and `eslint .` OOMs.
import { ESLint } from "eslint";
import { resolveIgnoresFromGitignore } from "neostandard";
import config from "../../eslint.config.js";

const gitignoreIgnores = resolveIgnoresFromGitignore();
const globalIgnores = config
  .filter((entry) => {
    const keys = Object.keys(entry);
    return keys.length === 1 && keys[0] === "ignores";
  })
  .flatMap((entry) => entry.ignores ?? []);

const missing = gitignoreIgnores.filter(
  (pattern) => !globalIgnores.includes(pattern),
);
if (missing.length > 0) {
  console.error(
    `gitignore patterns missing from a global ESLint ignore: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const eslint = new ESLint();
const mustIgnore = [
  ".vscode-test/downloaded/app.js",
  "out/test/foo.js",
  "dist/extension.js",
];
const notIgnored = [];
for (const file of mustIgnore) {
  if (!(await eslint.isPathIgnored(file))) {
    notIgnored.push(file);
  }
}
if (notIgnored.length > 0) {
  console.error(`expected ESLint to ignore: ${notIgnored.join(", ")}`);
  process.exit(1);
}
