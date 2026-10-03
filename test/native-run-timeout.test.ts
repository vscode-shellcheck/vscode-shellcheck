import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { version as BUNDLED_TOOL_VERSION } from "../bindl.config.js";
import {
  closeAllEditors,
  openDocument,
  resetRuntime,
  updateShellCheckSetting,
  waitForDiagnostics,
} from "./helpers.js";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function poll<T>(
  what: string,
  timeout: number,
  probe: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeout}ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// The stand-in executable is a POSIX shell script.
(process.platform === "win32" ? suite.skip : suite)(
  "Native run timeout",
  () => {
    let dir: string;
    let processIdFile: string;
    let executable: string;

    async function readProcessIds(): Promise<number[]> {
      const text = await fs.readFile(processIdFile, "utf-8").catch(() => "");
      return text.split(/\s+/).filter(Boolean).map(Number);
    }

    suiteSetup(async () => {
      await resetRuntime();
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "sc-timeout-"));
      processIdFile = path.join(dir, "processes");
      executable = path.join(dir, "shellcheck");
      // Answers the version check, then hangs the way a wrapper does whose
      // grandchild keeps stdout open: killing the script leaves the pipe open.
      await fs.writeFile(
        executable,
        [
          "#!/bin/sh",
          'if [ "$1" = "-V" ]; then',
          "  echo 'ShellCheck - shell script analysis tool'",
          `  echo 'version: ${BUNDLED_TOOL_VERSION}'`,
          "  echo 'license: GNU General Public License, version 3'",
          "  echo 'website: https://www.shellcheck.net'",
          "  exit 0",
          "fi",
          "sleep 600 &",
          `echo "$$ $!" >> '${processIdFile}'`,
          "wait",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
    });

    teardown(async () => {
      await closeAllEditors();
      await updateShellCheckSetting("executablePath", undefined);
      await updateShellCheckSetting("runTimeout", undefined);
      for (const pid of await readProcessIds()) {
        if (isAlive(pid)) {
          process.kill(pid, "SIGKILL");
        }
      }
    });

    suiteTeardown(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    test("kills a hung run and lints the document again afterwards", async () => {
      await updateShellCheckSetting("runTimeout", 1);
      await updateShellCheckSetting("executablePath", executable);

      const document = await openDocument("#!/bin/bash\nx=1", "shellscript");

      const [child] = await poll("the hung run to start", 5000, async () => {
        const processIds = await readProcessIds();
        return processIds.length ? processIds : undefined;
      });
      await poll("the hung run to be killed", 5000, async () =>
        isAlive(child) ? undefined : true,
      );

      // The document's delayer only takes a new run once the hung one settles.
      const diagnostics = waitForDiagnostics(document, 5000, (items) =>
        items.some(
          (diagnostic) =>
            typeof diagnostic.code === "object" &&
            diagnostic.code.value === "SC2034",
        ),
      );
      await updateShellCheckSetting("executablePath", undefined);
      assert.ok((await diagnostics).length > 0);
    });
  },
);
