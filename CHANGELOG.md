### [0.18.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.0...v0.18.1) (2021-10-20)


### Reverts

* Revert "feat: use workspace folder as working directory by default" ([a3e25e6](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/a3e25e615fb3b42b29d28ab4a5c43257e83b5480))

## [0.18.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.17.0...v0.18.0) (2021-10-20)


### Features

* add syntax highlight to `.shellcheckrc` ([29e11ef](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/29e11ef16dc7b3d8bb7fbc85ba154dbc56793724)), closes [#350](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/350)
* allow `executablePath` to be set in trusted workspaces ([36c2802](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/36c280213d8db93f2c5ab8a7f0ab85ac94ffeb17))
* use workspace folder as working directory by default ([eb05cb8](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/eb05cb870312cc612f04dbb3e8d819da8b940cc2))


### Dependencies

* **deps:** bumps minimum vscode version from 1.38 to 1.57 ([c349204](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/c3492046750bffcdb60ad4e7319cae6b71c0c94e))
* **deps:** update `glob` ([129eaaf](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/129eaaf4cebb9cc25844ed496186ec22fdc09105))

## [0.17.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.16.2...v0.17.0) (2021-10-11)


### Features

* allow `${workspaceFolder}` in `shellcheck.customArgs` ([#356](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/356)) ([1358710](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/135871057ebfe42aebc74e8775bba651f4f0e10a))

### [0.16.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.16.1...v0.16.2) (2021-09-09)


### Code Refactoring

* simplify codebase to upgrade webpack ([#308](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/308)) ([8454c64](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/8454c64213ea65831392586e7527d470fe64fa6d))

### [0.16.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.16.0...v0.16.1) (2021-09-09)


### Dependencies

* **deps:** remove `bl` dependency and upgrade others ([#309](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/309)) ([8c53a49](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/8c53a49ddd5af40c792bccd334368ea8032cdbfe))

## [0.16.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.15.3...v0.16.0) (2021-09-05)


### Features

* ignore Xonsh scripts ([#300](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/300)) ([e61391f](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/e61391f1098d5c310783b4923a75729e163c5397))

### [0.15.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.15.2...v0.15.3) (2021-09-03)


### Dependencies

* **deps:** bump tar from 6.1.3 to 6.1.11 ([#297](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/297)) ([3d083ed](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/3d083ed79acc9e0a80a53f711736268bc86eaeeb))

### [0.15.2](https://github.com/timonwong/vscode-shellcheck/compare/v0.15.1...v0.15.2) (2021-08-03)


### Bug Fixes

* loading bundled binary on Windows `ia32` arch ([#283](https://github.com/timonwong/vscode-shellcheck/issues/283)) ([8ddea18](https://github.com/timonwong/vscode-shellcheck/commit/8ddea18908fc5e691f45003eac822dca78a21fc1))

### [0.15.1](https://github.com/timonwong/vscode-shellcheck/compare/v0.15.0...v0.15.1) (2021-08-02)


### Dependencies

* **deps:** upgrade dependencies ([#279](https://github.com/timonwong/vscode-shellcheck/issues/279)) ([539efdc](https://github.com/timonwong/vscode-shellcheck/commit/539efdc51ffa6ab8206ed3595d350fe32d474652))

## [0.15.0](https://github.com/timonwong/vscode-shellcheck/compare/v0.14.4...v0.15.0) (2021-08-02)


### Features

* fix all issues on demand or on save ([#278](https://github.com/timonwong/vscode-shellcheck/issues/278)) ([bea1bda](https://github.com/timonwong/vscode-shellcheck/commit/bea1bdacc29afdf5697a437b5f40e2799bdf12f5)), closes [#273](https://github.com/timonwong/vscode-shellcheck/issues/273)

### [0.14.4](https://github.com/timonwong/vscode-shellcheck/compare/v0.14.3...v0.14.4) (2021-06-25)


### Bug Fixes

* `executablePath` not being respected ([#257](https://github.com/timonwong/vscode-shellcheck/issues/257)) ([d3710b9](https://github.com/timonwong/vscode-shellcheck/commit/d3710b97315b62c1aee9022aab0a416f356f6af9))

### [0.14.3](https://github.com/timonwong/vscode-shellcheck/compare/v0.14.2...v0.14.3) (2021-06-13)


### Dependencies

* **deps:** upgrade dependencies ([#248](https://github.com/timonwong/vscode-shellcheck/issues/248)) ([cd70efc](https://github.com/timonwong/vscode-shellcheck/commit/cd70efccea17c00c778b56f4909cdedd09c13ac9))

### [0.14.2](https://github.com/timonwong/vscode-shellcheck/compare/v0.14.1...v0.14.2) (2021-06-12)


### Bug Fixes

* not loading shellcheck from PATH when the bundled is not available ([#246](https://github.com/timonwong/vscode-shellcheck/issues/246)) ([7a31f98](https://github.com/timonwong/vscode-shellcheck/commit/7a31f98b9394859f7f466bbd236c5a89da4db199)), closes [#244](https://github.com/timonwong/vscode-shellcheck/issues/244)


### Dependencies

* **deps:** upgrade dependencies ([#245](https://github.com/timonwong/vscode-shellcheck/issues/245)) ([1f189eb](https://github.com/timonwong/vscode-shellcheck/commit/1f189eb072fa69d2af01ad35ca902434bc1f3037))

### [0.14.1](https://github.com/timonwong/vscode-shellcheck/compare/v0.14.0...v0.14.1) (2021-04-19)


### Bug Fixes

* timeout on shellcheck -V ([#180](https://github.com/timonwong/vscode-shellcheck/issues/180)) ([da3b38b](https://github.com/timonwong/vscode-shellcheck/commit/da3b38b4571f4ae75c93af8d24388132ba670eef))


### Dependencies

* **deps:** upgrade shellcheck from 0.7.1 to 0.7.2 ([#194](https://github.com/timonwong/vscode-shellcheck/issues/194)) ([04f99e0](https://github.com/timonwong/vscode-shellcheck/commit/04f99e0d4f4bcb4315e21ff88f9dc56e442434ae))

## [0.14.0](https://github.com/timonwong/vscode-shellcheck/compare/v0.13.4...v0.14.0) (2021-03-15)


### Features

* Enable the "Quick Fix" feature by default ([#182](https://github.com/timonwong/vscode-shellcheck/issues/182)) ([eb64cc3](https://github.com/timonwong/vscode-shellcheck/commit/eb64cc389efd754a859e12d50bd347a0a43c3181)), closes [#161](https://github.com/timonwong/vscode-shellcheck/issues/161)

### [0.13.4](https://github.com/timonwong/vscode-shellcheck/compare/v0.13.3...v0.13.4) (2021-03-14)


### Bug Fixes

* shellcheck.executablePath to machine scope ([#181](https://github.com/timonwong/vscode-shellcheck/issues/181)) ([3d68e17](https://github.com/timonwong/vscode-shellcheck/commit/3d68e17bcbf879e3303da9de4b48228a393f3b5e))

### [0.13.3](https://github.com/timonwong/vscode-shellcheck/compare/v0.13.2...v0.13.3) (2021-03-10)


### Dependencies

* **deps:** bump elliptic from 6.5.3 to 6.5.4 ([#178](https://github.com/timonwong/vscode-shellcheck/issues/178)) ([f15a1e7](https://github.com/timonwong/vscode-shellcheck/commit/f15a1e71f1515db1a92e22fc806d1b5d1f163c73))

### [0.13.2](https://github.com/timonwong/vscode-shellcheck/compare/v0.13.1...v0.13.2) (2021-02-08)


### Bug Fixes

* shellcheck command failed ([2a88284](https://github.com/timonwong/vscode-shellcheck/commit/2a882845bc28874df984aa080eebf9c429b74618)), closes [#144](https://github.com/timonwong/vscode-shellcheck/issues/144)

### [0.13.1](https://github.com/timonwong/vscode-shellcheck/compare/v0.13.0...v0.13.1) (2021-02-04)


### Bug Fixes

* downgrade recommended shellcheck version from 0.7.1 to 0.7.0 ([#163](https://github.com/timonwong/vscode-shellcheck/issues/163)) ([83cf71e](https://github.com/timonwong/vscode-shellcheck/commit/83cf71e7441b01144d28a7edd732ddac033ab519))

## [0.13.0](https://github.com/timonwong/vscode-shellcheck/compare/v0.12.3...v0.13.0) (2021-02-04)


### Features

* remove `useWSL` option ([#121](https://github.com/timonwong/vscode-shellcheck/issues/121)) ([9967218](https://github.com/timonwong/vscode-shellcheck/commit/99672183b9916142e9fc55f7e586810de9cd174d))

### [0.12.3](https://github.com/timonwong/vscode-shellcheck/compare/v0.12.2...v0.12.3) (2020-12-28)


### Dependencies

* **deps:** bump semver from 5.7.1 to 7.3.4 ([#149](https://github.com/timonwong/vscode-shellcheck/issues/149)) ([c77bde2](https://github.com/timonwong/vscode-shellcheck/commit/c77bde2d65191de2833df3105b7c4ff4c780919f))

### [0.12.2](https://github.com/timonwong/vscode-shellcheck/compare/v0.12.1...v0.12.2) (2020-12-12)

### [0.12.1](https://github.com/timonwong/vscode-shellcheck/compare/v0.12.0...v0.12.1) (2020-10-16)

## [0.12.0](https://github.com/timonwong/vscode-shellcheck/compare/v0.11.0...v0.12.0) (2020-10-10)


### Features

* add shellcheck binaries for Linux ARM ([#142](https://github.com/timonwong/vscode-shellcheck/issues/142)) ([f6047b5](https://github.com/timonwong/vscode-shellcheck/commit/f6047b58613324715edf8c31725afbaf73070ea7))

## [0.11.0](https://github.com/timonwong/vscode-shellcheck/compare/v0.10.1...v0.11.0) (2020-10-02)


### Features

* Add support to vscode deprecated tag (1.38+) ([03bedc0](https://github.com/timonwong/vscode-shellcheck/commit/03bedc0e1eee99b70a2bc4d06d04dac902b6e04c))
