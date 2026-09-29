// Runs the web suite in headless Chromium and saves the diagnostics it
// printed to out/web-e2e/diagnostics.json: @vscode/test-web keeps workspace
// writes in memory, so the page's console is the only way out.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const MARKER = "WEB_E2E_DIAGNOSTICS ";
const ARTIFACT = "out/web-e2e/diagnostics.json";

const child = spawn(
  "npx",
  [
    "vscode-test-web",
    "--browserType=chromium",
    "--headless",
    "--coi",
    "--extensionDevelopmentPath=.",
    "--extensionTestsPath=out/web-test/index.js",
    "test/fixtures/wasm-parity",
  ],
  { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" },
);

let diagnostics;
for await (const line of createInterface({ input: child.stdout })) {
  const marker = line.indexOf(MARKER);
  if (marker === -1) {
    console.log(line);
  } else {
    diagnostics = JSON.parse(line.slice(marker + MARKER.length));
  }
}
const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) {
  process.exit(exitCode ?? 1);
}
if (!diagnostics) {
  throw new Error("The web suite printed no diagnostics");
}
await mkdir("out/web-e2e", { recursive: true });
await writeFile(ARTIFACT, `${JSON.stringify(diagnostics, null, 2)}\n`);
console.log(`Wrote ${ARTIFACT}`);
