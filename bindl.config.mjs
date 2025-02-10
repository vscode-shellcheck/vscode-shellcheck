// @ts-check

const version = `v0.10.0`;
const releaseUrl = `https://github.com/vscode-shellcheck/shellcheck-binaries/releases/download/${version}/shellcheck-${version}`;

export default {
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${releaseUrl}.linux.x86_64.tar.gz`,
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${releaseUrl}.linux.armv6hf.tar.gz`,
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${releaseUrl}.linux.aarch64.tar.gz`,
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${releaseUrl}.darwin.x86_64.tar.gz`,
    },
    {
      platform: "darwin",
      arch: "arm64",
      url: `${releaseUrl}.darwin.aarch64.tar.gz`,
    },
    {
      platform: "win32",
      arch: "x64",
      url: `${releaseUrl}.windows.x86_64.tar.gz`,
    },
    {
      platform: "win32",
      arch: "arm64",
      url: `${releaseUrl}.windows.x86_64.tar.gz`,
    },
  ],
};
