const version = "v0.7.1";

module.exports = {
  binaries: [
    {
      platform: "linux",
      arch: "x64",
      url: `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}.linux.x86_64.tar.xz`,
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
      url: `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}.darwin.x86_64.tar.xz`,
      files: [
        {
          source: `shellcheck-${version}/shellcheck`,
          target: "shellcheck",
        },
      ],
    },
    {
      platform: "win32",
      arch: "x64",
      url: `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}.zip`,
      files: [
        { source: `shellcheck-${version}.exe`, target: "shellcheck.exe" },
      ],
    },
  ],
};
