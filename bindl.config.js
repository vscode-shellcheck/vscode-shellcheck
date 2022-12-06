const version = "v0.8.0";
const officialReleaseUrl = `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}`;
const ourReleaseUrl = `https://github.com/vscode-shellcheck/shellcheck-binaries/releases/download/${version}/shellcheck-${version}`;

module.exports = {
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${ourReleaseUrl}.linux.x86_64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${ourReleaseUrl}.linux.armv6hf.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${ourReleaseUrl}.linux.aarch64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${ourReleaseUrl}.darwin.x86_64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "darwin",
      arch: "arm64",
      url: `${ourReleaseUrl}.darwin.arm64.tar.gz`,
      files: [{ source: "shellcheck", target: "shellcheck" }],
    },
    {
      platform: "win32",
      arch: "x64",
      url: `${officialReleaseUrl}.zip`,
      files: [{ source: "shellcheck.exe", target: "shellcheck.exe" }],
    },
    {
      platform: "win32",
      arch: "ia32",
      url: `${officialReleaseUrl}.zip`,
      files: [{ source: "shellcheck.exe", target: "shellcheck.exe" }],
    },
    {
      platform: "win32",
      arch: "arm",
      url: `${officialReleaseUrl}.zip`,
      files: [{ source: "shellcheck.exe", target: "shellcheck.exe" }],
    },
  ],
};
