const version = "v0.7.1";
const commonUrl = `https://github.com/koalaman/shellcheck/releases/download/${version}/shellcheck-${version}`

module.exports = {
    binaries: [
        {
            platform: "linux",
            arch: "x64",
            url: `${commonUrl}.linux.x86_64.tar.xz`,
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
            url: `${commonUrl}.darwin.x86_64.tar.xz`,
            files: [
                {
                    source: `shellcheck-${version}/shellcheck`,
                    target: "shellcheck",
                },
            ],
        },
        {
            platform: "win32",
            arch: "x32",
            url: `${commonUrl}.zip`,
            files: [
                { source: `shellcheck-${version}.exe`, target: "shellcheck.exe" },
            ],
        },
    ],
};
