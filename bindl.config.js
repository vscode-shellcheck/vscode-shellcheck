// @ts-check

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const packageJsonPath = join(import.meta.dirname, "package.json");
const { shellcheckVersion } = JSON.parse(
  await readFile(packageJsonPath, "utf8"),
);

const version = `v${shellcheckVersion}`;
const releaseUrl = `https://github.com/vscode-shellcheck/shellcheck-binaries/releases/download/${version}/shellcheck-${version}`;

export default {
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${releaseUrl}.linux.x86_64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${releaseUrl}.linux.armv6hf.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${releaseUrl}.linux.aarch64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${releaseUrl}.darwin.x86_64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "darwin",
      arch: "arm64",
      url: `${releaseUrl}.darwin.aarch64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "win32",
      arch: "x64",
      url: `${releaseUrl}.windows.x86_64.tar.gz`,
      files: [{ source: "shellcheck.exe", target: "shellcheck.exe" }],
    },
    {
      platform: "win32",
      arch: "arm64",
      url: `${releaseUrl}.windows.x86_64.tar.gz`,
      files: [{ source: "shellcheck.exe", target: "shellcheck.exe" }],
    },
  ],
};
