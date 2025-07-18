// @ts-check

import { defineConfig } from "bindl";

const version = `v0.10.0`;
const releaseUrl = `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}`;

export default defineConfig({
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${releaseUrl}.linux.x86_64.tar.xz`,
      stripComponents: 1,
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${releaseUrl}.linux.armv6hf.tar.xz`,
      stripComponents: 1,
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${releaseUrl}.linux.aarch64.tar.xz`,
      stripComponents: 1,
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${releaseUrl}.darwin.x86_64.tar.xz`,
      stripComponents: 1,
    },
    {
      platform: "darwin",
      arch: "arm64",
      url: `${releaseUrl}.darwin.aarch64.tar.xz`,
      stripComponents: 1,
    },
    {
      platform: "win32",
      arch: "x64",
      url: `${releaseUrl}.zip`,
    },
    {
      platform: "win32",
      arch: "arm64",
      url: `${releaseUrl}.zip`,
    },
  ],
});
