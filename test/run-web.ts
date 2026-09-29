import fs from "node:fs/promises";
import path from "node:path";
import { runTests } from "@vscode/test-web";
import { startArtifactReceiver } from "./web-artifact-receiver.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(repositoryRoot, "test/fixtures/wasm-parity");
const artifactDirectory = path.join(fixturePath, ".e2e-artifacts");
const receiverUrlPath = path.join(artifactDirectory, "receiver-url");
const artifactPath = path.join(artifactDirectory, "web-diagnostics.json");

await fs.mkdir(artifactDirectory, { recursive: true });
const receiver = await startArtifactReceiver(artifactPath);
await fs.writeFile(receiverUrlPath, receiver.url);

try {
  await runTests({
    browserType: "chromium",
    headless: true,
    coi: true,
    extensionDevelopmentPath: repositoryRoot,
    extensionTestsPath: path.join(repositoryRoot, "dist/web/test/index.js"),
    folderPath: fixturePath,
  });
  await receiver.received;
} finally {
  await fs.rm(receiverUrlPath, { force: true });
  await receiver.close();
}
