const version = "v0.8.0";
const shortVersion = version.substring(1);
const shellcheckReleaseUrl = `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}`;
const shellcheckM1DownloadBaseUrl = `https://github.com/vscode-shellcheck/shellcheck-m1/releases/download/${version}/`;

module.exports = {
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `${shellcheckReleaseUrl}.linux.x86_64.tar.xz`,
      files: [
        {
          source: `shellcheck-${version}/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "linux",
      arch: "arm",
      url: `${shellcheckReleaseUrl}.linux.armv6hf.tar.xz`,
      files: [
        {
          source: `shellcheck-${version}/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "linux",
      arch: "arm64",
      url: `${shellcheckReleaseUrl}.linux.aarch64.tar.xz`,
      files: [
        {
          source: `shellcheck-${version}/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "darwin",
      arch: "x64",
      url: `${shellcheckReleaseUrl}.darwin.x86_64.tar.xz`,
      files: [
        {
          source: `shellcheck-${version}/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "darwin",
      arch: "arm64",
      // Sync from homebrew
      url: `${shellcheckM1DownloadBaseUrl}shellcheck-${shortVersion}.tar.gz`,
      files: [
        {
          source: `shellcheck/${shortVersion}/bin/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "win32",
      arch: "x32",
      url: `${shellcheckReleaseUrl}.zip`,
      files: [{ source: `shellcheck.exe`, target: "shellcheck.exe" }],
    },
  ],
};
