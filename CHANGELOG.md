## [0.29.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.29.2...v0.29.3) (2023-01-05)


### Dependencies

* **deps:** bump minimatch from 5.1.1 to 5.1.2 ([#871](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/871)) ([28d7646](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/28d764686c33f9da7302e2838804cde551091bce))

## [0.29.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.29.1...v0.29.2) (2022-12-13)


### Dependencies

* **deps:** upgrade bundled shellcheck from 0.8.0 to 0.9.0 ([#865](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/865)) ([c66f677](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/c66f6779960d00ca93132320c316d20769435d45))

## [0.29.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.29.0...v0.29.1) (2022-12-06)


### Dependencies

* **deps:** fix windows arm vsix without binary ([3b56c78](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/3b56c786f3cac71818179da44db30901f1d81263))

## [0.29.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.28.2...v0.29.0) (2022-12-06)


### Features

* publish universal `vsix` without binaries ([#852](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/852)) ([212550f](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/212550f77fe57235e7d7d289edea92772fa45f9e))


### Dependencies

* **deps:** bump decode-uri-component from 0.2.0 to 0.2.2 ([#844](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/844)) ([231d034](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/231d03497c3d6746682c3119da68f99f4999d637))
* **deps:** bump minimatch from 5.1.0 to 5.1.1 ([#839](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/839)) ([922d10d](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/922d10d582a923fee110c990e0d500975c4bbdc6))

## [0.28.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.28.1...v0.28.2) (2022-11-17)


### Dependencies

* **deps:** use x86 binary on windows for arm ([#825](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/825)) ([de6d2e4](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/de6d2e4e8f77959de387ee449c0431804fccfa59)), closes [#824](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/824)

## [0.28.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.28.0...v0.28.1) (2022-11-17)


### Bug Fixes

* windows x86 (32 bits) vsix does not contain the binary ([#823](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/823)) ([387641d](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/387641d1def026f34983dda1ce916ab461cc6692)), closes [#805](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/805)

## [0.28.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.27.0...v0.28.0) (2022-11-17)


### Features

* publish platform-specific vsix ([#805](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/805)) ([419d7a0](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/419d7a018367accd843535679f9c0b4fa2d70d9e))

## [0.26.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.26.2...v0.26.3) (2022-11-03)


### Bug Fixes

* detect shellcheck versions with `v` as prefix ([#806](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/806)) ([ebcece8](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/ebcece82af0e0c98b9768a34bf70778c145ee015)), closes [#804](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/804)

## [0.26.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.26.1...v0.26.2) (2022-10-26)


### Bug Fixes

* ignore patterns added in settings ui not being ignored ([#792](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/792)) ([53022f6](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/53022f6db2198e21fc2f8d11e1ed10d703e0a10f)), closes [#790](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/790)

## [0.26.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.26.0...v0.26.1) (2022-10-22)


### Bug Fixes

* missing resource files ([#785](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/785)) ([3423e3e](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/3423e3e698c23fa7e7aa3b567382c8be09af3044)), closes [#784](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/784)

## [0.26.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.25.1...v0.26.0) (2022-10-21)


### Features

* colorize output ([#781](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/781)) ([84beebe](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/84beebe5b442fbcd6ac8c9d5840d1a7ad045bf8a)), closes [microsoft/vscode-react-native#1385](https://github.com/microsoft/vscode-react-native/issues/1385)

## [0.25.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.25.0...v0.25.1) (2022-10-21)


### Bug Fixes

* ensure cwd exists before spawn shellcheck ([#780](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/780)) ([79febb8](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/79febb8464fbfe924deffdaa645ee18c380e64c3)), closes [#767](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/767)

## [0.25.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.24.0...v0.25.0) (2022-10-20)


### Features

* validate user input for `shellcheck.exclude` ([#776](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/776)) ([561cf12](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/561cf12d21714eb6d976415ad62c225d115c1fd0)), closes [#739](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/739)

## [0.24.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.23.1...v0.24.0) (2022-10-20)


### Features

* add log level & fix potential missing error during spawn ([#774](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/774)) ([669aae0](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/669aae0a69877aa703415061f3edfd4a03b6f3ed))

## [0.23.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.23.0...v0.23.1) (2022-10-07)


### Dependencies

* **deps:** bump semver from 7.3.7 to 7.3.8 ([#759](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/759)) ([633d2de](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/633d2decb628c9010a980e8718a9c95a0aa034c9))

## [0.23.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.22.0...v0.23.0) (2022-09-19)


### Features

* improve some configuration descriptions ([#741](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/741)) ([7fdb12f](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/7fdb12f925dbf2a4fc2b95b80fffef1fb353bb50))

## [0.22.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.21.4...v0.22.0) (2022-09-02)


### Features

* add prebuilt Shellcheck binary for Apple M1 (from Homebrew) ([#725](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/725)) ([bd0069d](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/bd0069d117eb23300c0370d268a7dd6d254880fc))

## [0.21.4](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.21.3...v0.21.4) (2022-08-31)


### Bug Fixes

* use named diagnostic collection ([#721](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/721)) ([562186d](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/562186dbd3b1b4b879102bea9fc68ed109ad5ee9)), closes [#666](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/666)

## [0.21.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.21.2...v0.21.3) (2022-08-29)


### Dependencies

* **deps:** refresh dependencies tree ([301e662](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/301e6627398f04c0f877500bdc1fa13c0170aad9))

## [0.21.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.21.1...v0.21.2) (2022-08-27)


### Bug Fixes

* honor folder-level and lang-specific settings ([#697](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/697)) ([687b72e](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/687b72ede70665a4e89c6cbaf85da30bf08764f9))

## [0.21.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.21.0...v0.21.1) (2022-08-23)


### Code Refactoring

* make mutually exclusive fields a union ([#705](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/705)) ([9f3b88b](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/9f3b88b71f1eb56ff9992110bd8de5fbd9811ac5))

## [0.21.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.20.0...v0.21.0) (2022-08-23)


### Features

* allow linting for domain-specific shell languages ([#696](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/696)) ([83636d2](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/83636d28f7ea5a0a73cae2a6e81b82880e680c5f))


### Bug Fixes

* prevent endless feedback loops ([#698](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/698)) ([e8ada0c](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/e8ada0c77dc0df32d05e3c73679e4e81271827e2))

## [0.20.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.6...v0.20.0) (2022-08-14)


### Features

* provide inline links to wiki on hover ([#686](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/686)) ([1293da9](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/1293da9318e9272ff03631c9d0c768f6ce364daf))

## [0.19.6](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.5...v0.19.6) (2022-07-20)


### Dependencies

* **deps:** bump terser from 5.10.0 to 5.14.2 ([#664](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/664)) ([dc4ac57](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/dc4ac57219dc9cfc13a0ecb7b701b750970c56c2))

## [0.19.5](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.4...v0.19.5) (2022-06-10)


### Code Refactoring

* remove unnecessary files from extension ([aa487a8](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/aa487a896929f3fd8cb74fdbcb963d3892a8d72e))
* support sponsorship ([19e1591](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/19e1591b53dc16e8eae8a847db90dfe39dff138e))

## [0.19.4](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.3...v0.19.4) (2022-06-04)


### Dependencies

* **deps:** bump npm from 8.4.1 to 8.12.1 ([#606](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/606)) ([16d94b1](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/16d94b1f52bccd8c46f54d9cc98b27571502279e))
* **deps:** bump semver-regex from 3.1.3 to 3.1.4 ([#610](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/610)) ([25ec436](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/25ec4366a716a7620a91ba6c5bad8fa068da36d5))

### [0.19.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.2...v0.19.3) (2022-05-16)


### Dependencies

* **deps:** bump minimatch from 5.0.1 to 5.1.0 ([#583](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/583)) ([984ab34](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/984ab34be14d80f847205901f73ad16186a51cb1))

### [0.19.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.1...v0.19.2) (2022-04-13)


### Dependencies

* **deps:** bump semver from 7.3.6 to 7.3.7 ([#556](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/556)) ([e6e29e2](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/e6e29e2a5679c3ee8c221a2b5a08048269852e4b))

### [0.19.1](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.19.0...v0.19.1) (2022-04-06)


### Dependencies

* **deps:** bump semver from 7.3.5 to 7.3.6 ([#547](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/547)) ([bb522e1](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/bb522e1becc1a0ec99c46d09fe539534dc268f63))

## [0.19.0](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.10...v0.19.0) (2022-03-31)


### Features

* allow shellcheck directives to be ctrl-clicked ([#539](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/539)) ([9503e44](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/9503e44173d38d9c1e254d88ec3d2bcef41bdb69)), closes [#299](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/299) [#535](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/535)


### Bug Fixes

* linkify RE only works for first line ([#540](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/540)) ([b575bfe](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/b575bfe86a069c77ccddcb2d99cd49db35df1775))
* not working together with the SSH FS extension ([#538](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/538)) ([fc76402](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/fc76402b7959cd422d4d8e0828af3df1fe954c20)), closes [#536](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/536)

### [0.18.10](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.9...v0.18.10) (2022-03-25)


### Dependencies

* **deps:** bump minimist from 1.2.5 to 1.2.6 ([#526](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/526)) ([dc6d6e0](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/dc6d6e0366f5c986135c84107ae12290cf432714))

### [0.18.9](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.8...v0.18.9) (2022-02-24)


### Dependencies

* **deps:** bump minimatch from 5.0.0 to 5.0.1 ([#500](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/500)) ([a90fc68](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/a90fc6845582fc1a1b088e04a7b304e260298ec5))

### [0.18.8](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.7...v0.18.8) (2022-02-15)


### Dependencies

* **deps:** bump minimatch from 4.1.1 to 5.0.0 ([#491](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/491)) ([111198a](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/111198af095463d7878448dceb4a9dbe8c412af9))

### [0.18.7](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.6...v0.18.7) (2022-02-14)


### Dependencies

* **deps:** bump minimatch from 3.0.5 to 4.1.1 ([#487](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/487)) ([0646511](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/0646511a3cde9cc88493b3e82015f51a19bff79c))

### [0.18.6](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.5...v0.18.6) (2022-02-07)


### Dependencies

* **deps:** bump minimatch from 3.0.4 to 3.0.5 ([#481](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/481)) ([b428474](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/b4284745ab21662d1b4f29b0bbcf7ec9201f32bd))

### [0.18.5](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.4...v0.18.5) (2022-02-04)


### Dependencies

* **deps:** refresh dependencies ([e308dd9](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/e308dd928b32635ab62a99ec4803dc20c93f3d60))

### [0.18.4](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.3...v0.18.4) (2022-01-18)


### Dependencies

* **deps:** update build dependencies ([#449](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/449)) ([5a75236](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/5a75236db24ce4193e225b9109e9f758eb9ad169))

### [0.18.3](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.2...v0.18.3) (2021-12-19)


### Bug Fixes

* only fix one issue when multiples are found ([bd4222d](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/bd4222dfd7e51cf2147196709409f7f93f5845c4)), closes [#367](https://github.com/vscode-shellcheck/vscode-shellcheck/issues/367)

### [0.18.2](https://github.com/vscode-shellcheck/vscode-shellcheck/compare/v0.18.1...v0.18.2) (2021-11-07)


### Dependencies

* **deps:** upgrade shellcheck to v0.8.0 ([931b3eb](https://github.com/vscode-shellcheck/vscode-shellcheck/commit/931b3eb8136a61efcfee58f885d5b992f441cb0d)), closes [/github.com/koalaman/shellcheck/blob/master/CHANGELOG.md#v080---2021-11-06](https://github.com/vscode-shellcheck//github.com/koalaman/shellcheck/blob/master/CHANGELOG.md/issues/v080---2021-11-06)

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
