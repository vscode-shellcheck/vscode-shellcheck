import execa from "execa";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const packageJsonPath = path.resolve(import.meta.dirname, "package.json");
const packageJsonString = await readFile(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonString);
packageJson.type = "commonjs";
await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

const { exitCode } = await execa("vscode-test", [], {
  reject: false,
  preferLocal: true,
  stdio: "inherit",
});

await writeFile(packageJsonPath, packageJsonString);

process.exit(exitCode);
