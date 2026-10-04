// VS Code shows a `%key%` that package.nls.json lacks as the raw placeholder.
import { readFileSync } from "node:fs";

const manifest = readFileSync("package.json", "utf8");
const messages = JSON.parse(readFileSync("package.nls.json", "utf8"));
const missing = [...manifest.matchAll(/"%([\w.-]+)%"/g)]
  .map(([, key]) => key)
  .filter((key) => !Object.hasOwn(messages, key));

if (missing.length > 0) {
  console.error(`Missing from package.nls.json: ${missing.join(", ")}`);
  process.exit(1);
}
