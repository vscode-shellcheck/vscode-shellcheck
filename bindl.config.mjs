// @ts-check

import { defineConfig } from "bindl";

const version = "0.11.0";
const releaseUrl = `https://github.com/koalaman/shellcheck/releases/download/v${version}/shellcheck-v${version}`;

/** @type {import("bindl").BindlBinaryTest} */
const unixTest = {
  command: "./shellcheck --version",
  expectedOutputContains: `version: ${version}`,
};

/** @type {import("bindl").BindlBinaryTest} */
const windowsTest = {
  command: ".\\shellcheck.exe --version",
  expectedOutputContains: `version: ${version}`,
};

export default defineConfig({
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${releaseUrl}.linux.x86_64.tar.xz`,
      stripComponents: 1,
      tests: [unixTest],
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${releaseUrl}.linux.armv6hf.tar.xz`,
      stripComponents: 1,
      tests: [unixTest],
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${releaseUrl}.linux.aarch64.tar.xz`,
      stripComponents: 1,
      tests: [unixTest],
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${releaseUrl}.darwin.x86_64.tar.xz`,
      stripComponents: 1,
      tests: [unixTest],
    },
    {
      platform: "darwin",
      arch: "arm64",
      url: `${releaseUrl}.darwin.aarch64.tar.xz`,
      stripComponents: 1,
      tests: [unixTest],
    },
    {
      platform: "win32",
      arch: "x64",
      url: `${releaseUrl}.zip`,
      tests: [windowsTest],
    },
    {
      platform: "win32",
      arch: "arm64",
      url: `${releaseUrl}.zip`,
      tests: [windowsTest],
    },
  ],
});
