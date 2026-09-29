import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startArtifactReceiver } from "./web-artifact-receiver.js";

suite("Web artifact receiver", () => {
  test("persists the bytes posted by the web test", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "shellcheck-web-"),
    );
    const artifactPath = path.join(directory, "web-diagnostics.json");
    const receiver = await startArtifactReceiver(artifactPath);

    try {
      const expected = '{"diagnostics":[]}\n';
      const response = await fetch(receiver.url, {
        method: "POST",
        body: expected,
      });

      assert.equal(response.status, 204);
      assert.equal(await fs.readFile(artifactPath, "utf8"), expected);
    } finally {
      await receiver.close();
      await fs.rm(directory, { recursive: true });
    }
  });
});
