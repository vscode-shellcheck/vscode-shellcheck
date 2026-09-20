# shellcheck-on-wasm feasibility spike — results

Throwaway spike. All artifacts and scripts live in `/tmp/shellcheck-wasm-spike`.
Everything below was measured on this machine; no numbers are estimated.

## 0. Environment

|                   |                                                                           |
| ----------------- | ------------------------------------------------------------------------- |
| CPU               | Intel(R) Xeon(R) Gold 6248R @ 3.00GHz, 16 vCPU (1 thread/core, KVM guest) |
| OS                | Linux 3.10.0-1160.el7.x86_64                                              |
| Node (primary)    | **v24.15.0** (`mise` install `node/24.15.0`)                              |
| Node (secondary)  | **v22.23.2**, **v20.20.2** (both installed via `mise`)                    |
| native shellcheck | v0.11.0 (`artifacts/shellcheck-v0.11.0/shellcheck`)                       |

```
$ node -v
v24.15.0
$ lscpu | head
Model name:          Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz
CPU(s):              16
$ nproc
16
```

## 1. Artifacts under test (Q-C8)

| artifact                                                        | raw bytes  | gzip -9   | zip -9    | sha256                                                             |
| --------------------------------------------------------------- | ---------- | --------- | --------- | ------------------------------------------------------------------ |
| `artifacts/shellcheck.wasm` (go-shellcheck, **command**)        | 7,650,497  | 1,761,616 | 1,761,762 | `f9d99fa45ae12d5b735425e6a32f6ea3cc550095b1e82ec1b770141470278c20` |
| `shellcheck-wasm/dist/shellcheck.wasm` (**reactor**)            | 16,981,435 | 2,374,209 | 2,374,355 | `ff8f9fadb1d2dace2d1af4e78ba0f78d55d8ee789765245d1f1c65ed13944519` |
| `artifacts/shellcheck-v0.11.0/shellcheck` (native linux x86_64) | 16,213,136 | –         | –         | `4da528ddb3a4d1b7b24a59d4e16eb2f5fd960f4bd9a3708a15baddbdf1d5a55b` |

Provenance of the command build — byte-identical to `internal/wasm/shellcheck.wasm`
on `wasilibs/go-shellcheck` `main`:

```
local git blob sha1: 29fce3f0b122d062a6937cfd79f4c10a0f06c50f len 7650497
GET /repos/wasilibs/go-shellcheck/contents/internal/wasm/shellcheck.wasm?ref=main
  {'sha': '29fce3f0b122d062a6937cfd79f4c10a0f06c50f', 'size': 7650497}
GET /repos/wasilibs/go-shellcheck/commits?path=internal/wasm/shellcheck.wasm
  24025c1590296bcce8e494624e8c3561740a32a4 2025-08-29T01:28:02Z Update to latest upstream (#9)
```

- wasm blob last changed by commit **`24025c1590296bcce8e494624e8c3561740a32a4`** (2025-08-29).
- repo HEAD at download time: `ef5bcd522bf9c1e349675a467cd005a17e58873e`.
- Reactor package: `shellcheck-wasm@0.3.3`, `@bjorn3/browser_wasi_shim@0.4.2`.

Both wasm builds report shellcheck **0.11.0**, matching the native baseline.

Test scripts (`scripts/`): `small.sh` 735 B / 28 lines / 14 findings,
`medium.sh` 10,133 B / 308 lines / 155 findings, `large.sh` 50,445 B / 1508 lines
/ 766 findings, `clean.sh` (0 findings).

---

## 2. CRITICAL: `core.6604` — node:wasi SIGSEGV with `preopens` on Node 22

The 127 MB core dump was produced by the previous agent's run of `qb-fs.mjs`.
Parsed from the core's ELF notes (this box's `readelf` is a 32-bit build and
cannot decode 64-bit notes, so they were parsed with Python):

```
PRPSINFO pid=6604 ppid=6601 fname='node'
  psargs='node qb-fs.mjs '
PRSTATUS(first thread) cursig=11 (SIGSEGV) rip=0x13b1af9
SIGINFO signo=11 errno=0 code=-6 (SI_TKILL) si_addr=0x3e8000019cc   # uid 1000 / pid 6604
NT_FILE mapping containing RIP:
  0x000000e37000-0x0000032e4000 /home/vscode/.local/share/mise/installs/node/22.23.2/bin/node
```

The crashing process ran under **Node 22.23.2** (not the default 24.15.0) and the
fault address is inside the `node` binary's text. `si_code = SI_TKILL` means the
SIGSEGV was delivered by `tgkill()` from the process to itself.

### Reproduction

```
$ PATH=.../node/22.23.2/bin:$PATH node qb-fs.mjs ; echo EXIT=$?
== B-a: node:wasi file input, various preopen layouts ==
  preopens {'/': fixture}  arg=/proj/sub/main.sh
     rc=1 ... comments: 1091@3:8 2086@6:6 2086@8:6
  preopens {'/': fixture}  arg=proj/sub/main.sh (RELATIVE)
     rc=1 ... comments: 1091@3:8 2086@6:6 2086@8:6
EXIT=139            # 128+11 = SIGSEGV; stderr completely empty
```

The same script on Node 24.15.0 runs all 11 cases to completion, EXIT=0.

### Isolation (`qb-crash.mjs`, `qb-crash2.mjs`, `qb-crash3.mjs`)

`qb-crash3.mjs` is a self-contained minimal repro (no shared helpers, no
double-close of fds): loop `new WASI({...}) -> new Instance -> wasi.start()` on
one compiled Module.

```
node22 qb-crash3.mjs preopen   nclose 8   -> run 1, run 2, <SIGSEGV>  (exit 139)
node22 qb-crash3.mjs nopreopen nclose 8   -> survived 8
node24 qb-crash3.mjs preopen   nclose 8   -> survived 8
node24 qb-crash2.mjs dot 60               -> survived 60
node22 qb-crash2.mjs stdin 60             -> survived 60   (no preopens)
node22 qb-crash2.mjs file 60              -> run 1, run 2, <SIGSEGV>
node22 qb-crash2.mjs stdinPre 60          -> run 1, run 2, <SIGSEGV>  (stdin input, preopens set)
```

- The trigger is **`preopens` being passed to `node:wasi`**, not the input mode.
  With `preopens: undefined` it never crashed (60/60 on both versions).
- It is not one bad preopen name: `'/'`, `'.'`, `'./'`, `''` and a non-existent
  `'x'` behave identically. One run per process is always fine (`qb-crash.mjs`
  runs 8 different preopen/arg shapes one-per-process: all exit 0 on 22 and 24).
- **Flaky but frequent**: over 10 iterations on Node 22 it died on run 3 in 5 of
  8 attempts. Keeping references to the `WASI` objects and forcing `global.gc()`
  did not change this systematically, so a GC-finalisation use-after-free is
  _not_ confirmed.
- The host process dies **silently**: exit 139, no JS exception, empty stderr,
  no `uncaughtException`. Not catchable from JS.
- `node:wasi` **leaks one fd per run when `preopens` is used** (both versions;
  on Node 24 `/proc/self/fd` grows 19 -> 79 over 60 runs). Real leak for a
  long-lived extension host even where it does not crash.

Symbolising RIP `0x13b1af9` (minus the 0x400000 load bias) against the node
binary's _dynamic_ symbol table lands in `node::Dotenv::ParseContent`, which is
almost certainly wrong (large gaps in `.dynsym`). **The exact faulting function
could not be determined** — no `gdb` and no symbolised build on this box.

Core file deleted as instructed; all shells ran `ulimit -c 0`, no new dumps.

---

## 3. Q-A — stdin for the command build

### (a) node:wasi

`qa-nodewasi.mjs` (`returnOnExit: true`, no preopens):

```
### CASE stdin=regular-file-fd (scripts/small.sh)
  exitCode=1 thrown=none
  stdout.len=4735 stderr=""
  comments=14 firstCodes=2034@5:9,2086@7:19,2045@8:12,2086@9:8,2086@9:19

### CASE stdin=fd0 real pipe      # cat scripts/small.sh | node qa-nodewasi.mjs ... pipe
  exitCode=1 thrown=none
  stdout.len=4735 stderr=""
  comments=14 firstCodes=2034@5:9,2086@7:19,2045@8:12,2086@9:8,2086@9:19
```

Both work, identical output. Gotcha: **`node:wasi` closes the fds handed to it as
`stdin`/`stdout`/`stderr`**; closing them yourself afterwards throws
`EBADF: bad file descriptor, close`.

### (b) @bjorn3/browser_wasi_shim with an in-memory stdin Fd

`lib-shim.mjs::MemStdin` reports `FILETYPE_CHARACTER_DEVICE` and returns 0 bytes
at EOF. `qa-shim.mjs`:

```
### SHIM CASE stdin=MemStdin (scripts/small.sh)
  rc=0 thrown=null
  stdout.len=4735 stderr=""
  comments=14
```

Works, byte-identical to node:wasi.

### Output equality vs native json1 (`qa-compare.mjs`)

```
=== small (735 bytes) ===
  native      rc=1 comments=14
  node:wasi   rc=1 bytesEqual=true rawEqual=true
  shim        rc=1 bytesEqual=true rawEqual=true
=== medium (10133 bytes) ===
  native      rc=1 comments=155
  node:wasi   rc=1 bytesEqual=true rawEqual=true
  shim        rc=1 bytesEqual=true rawEqual=true
=== large (50445 bytes) ===
  native      rc=1 comments=766
  node:wasi   rc=1 bytesEqual=true rawEqual=true
  shim        rc=1 bytesEqual=true rawEqual=true
```

**Byte-for-byte identical** (`rawEqual=true`) including `fix` payloads, all three
sizes, both hosts.

### `PWD` in the WASI environment

Depends on whether the directory is reachable through a preopen.

- **browser_wasi_shim, no matching preopen** — fails as predicted and _silently_
  produces empty stdout:

  ```
  ### SHIM CASE stdin=MemStdin WITH PWD env
    rc=0 thrown=null
    stdout.len=0 stderr="hs_init_ghc: chdir(/tmp/shellcheck-wasm-spike) failed with -1\n"
  ```

- **node:wasi with a preopen covering the path** — `PWD` _works_, and is the
  mechanism that makes the guest behave like `cd <dir>` (§4).

So `PWD` is the cwd control knob; it just has to name a path inside the preopen tree.

---

## 4. Q-B — file input, `.shellcheckrc`, sourced files

Fixture (`fixture/proj/`):

```
proj/.shellcheckrc   ->  disable=SC2034 / external-sources=true
proj/lib/util.sh     ->  defines UTIL_HOME, util_greet
proj/sub/main.sh     ->  # shellcheck source=../lib/util.sh ; source ../lib/util.sh ; ...
```

Native reference with `cwd = fixture/proj/sub`: **one** finding, `SC2086@8:6`
(no SC1091 => sourced file followed; no SC2034 => parent `.shellcheckrc` honoured).

### (a)+(b) node:wasi with a file path argument — `qb-fs.mjs`

```
== B-a: node:wasi file input, various preopen layouts ==
  preopens {'/': fixture}  arg=/proj/sub/main.sh       -> 1091@3:8 2086@6:6 2086@8:6
  preopens {'/': fixture}  arg=proj/sub/main.sh        -> 1091@3:8 2086@6:6 2086@8:6
  preopens {'.': fixture}  arg=./proj/sub/main.sh      -> 1091@3:8 2086@6:6 2086@8:6
  preopens {'.': fixture}  arg=proj/sub/main.sh        -> 1091@3:8 2086@6:6 2086@8:6
  preopens {'/': fixture/proj/sub} arg=/main.sh        -> 1091@3:8 2034@5:1 2086@6:6 2086@8:6

== B-b: emulated cwd via PWD + preopen ==
  PWD=/proj/sub preopen {'/':fixture} arg=main.sh           -> 2086@8:6   <-- matches native
  PWD=/proj/sub preopen {'/':fixture} arg=/proj/sub/main.sh -> 2086@8:6   <-- matches native
```

File-path arguments work. **Without** `PWD` the guest cwd is `/`, so the relative
`source ../lib/util.sh` is not resolved (SC1091) and the parent `.shellcheckrc`
is not found (SC2034 present). **With `PWD` = guest path of the document's
directory**, both resolve and the result matches native exactly.

### (c) stdin input (`-`) — the important one

```
== B-c: STDIN mode (`-`) + rc/source lookup ==
  stdin, preopen {'/':fixture}, no PWD                  -> 1091@3:8 2034@5:1 2086@6:6 2086@8:6
  stdin, preopen {'/':fixture}, PWD=/proj/sub           -> 2086@8:6           <-- matches native
  stdin, preopen {'/':fixture/proj/sub}, PWD=/          -> 1091@3:8 2034@5:1 2086@6:6 2086@8:6
  stdin, preopen {'/':fixture}, -P /proj/sub -x -       -> 2034@5:1 2086@8:6  (source found, rc NOT found)
```

Byte-level verification against native (`qb-verify.mjs`):

```
native file  : {"comments":[{"file":"main.sh","line":8,...,"code":2086,...,"fix":{...}}]}
wasm  file   : {"comments":[{"file":"main.sh","line":8,...,"code":2086,...,"fix":{...}}]}
EQUAL(file)  : true
native stdin : {"comments":[{"file":"-","line":8,...
wasm  stdin  : {"comments":[{"file":"-","line":8,...
EQUAL(stdin) : true
```

**Yes — stdin mode can be made to behave like native-with-cwd.** Recipe:
`preopens = { '/': <workspace/document root> }` **plus**
`env.PWD = <guest path of the document's directory>`. Parent `.shellcheckrc` and
relative `source` targets then resolve from the emulated cwd and stdout is
byte-identical to native run with that cwd.

Limits:

- `PWD` must name a directory **inside** the preopen tree, otherwise the Haskell
  RTS `chdir` fails (silent empty stdout under the shim, §3).
- Preopening only the document's own directory is not enough — `.shellcheckrc`
  lookup walks _upward_, so the preopen must be at or above the rc file.
- `-P <dir>` gets the sourced file resolved but does **not** affect
  `.shellcheckrc` discovery (2034 still reported). `PWD` is strictly more capable.
- No virtual-file overlay is needed for rc + source resolution on unsaved
  buffers. The only difference from a real file is the JSON `file` field, `"-"`
  instead of a path — same as native `shellcheck -`.

### browser_wasi_shim with a node:fs-backed preopen — `lib-shim-fs.mjs`

`HostPreopenDirectory` is a read-only preopen `Fd` backed by synchronous
`node:fs`, implementing exactly the calls seen in the trace below.
`qb-shimfs.mjs`:

```
== B-d: browser_wasi_shim + custom node:fs-backed preopen ==
  file mode, PWD=/proj/sub, preopen '/'->fixture, arg=main.sh
     rc=1 thrown=- err=-
     comments: 2086@8:6
     byteEqualToNative=true
```

The "overlay a virtual file over a real-fs-backed tree" design **is** feasible: a
custom `Fd` subclass is all that is needed, the guest-visible traversal is fully
observable from JS (the debug log shows `proj`, `proj/sub`, `proj/.shellcheckrc`,
`proj/sub/../lib/util.sh`, `proj/sub/main.sh`), and returning an in-memory buffer
for one specific path instead of opening the host file is a few lines in
`path_open`. Not needed for the stdin use case, but it is the route to lint an
unsaved buffer _as_ `/proj/sub/main.sh` so the `file` field carries the real path.

### (d) WASI imports actually used — `qb-trace.mjs`

Per-run call counts (import namespace proxied):

| import                              | fixture file-mode (node:wasi) | stdin small (node:wasi) | stdin large (node:wasi) | stdin small (shim) |
| ----------------------------------- | ----------------------------- | ----------------------- | ----------------------- | ------------------ |
| `clock_time_get`                    | 12                            | 14                      | 336                     | 14                 |
| `path_readlink`                     | 9                             | –                       | –                       | –                  |
| `path_filestat_get`                 | 8                             | –                       | –                       | –                  |
| `fd_filestat_get`                   | 8                             | –                       | –                       | –                  |
| `fd_read`                           | 8                             | 2                       | 8                       | 2                  |
| `fd_fdstat_get`                     | 4                             | –                       | –                       | –                  |
| `path_open`                         | 4                             | –                       | –                       | –                  |
| `fd_close`                          | 4                             | 1                       | 1                       | 1                  |
| `fd_prestat_get`                    | 2                             | 1                       | 1                       | 1                  |
| `fd_prestat_dir_name`               | 1                             | –                       | –                       | –                  |
| `environ_sizes_get` / `environ_get` | 1 / 1                         | 1 / –                   | 1 / –                   | 1 / –              |
| `args_sizes_get` / `args_get`       | 1 / 1                         | 1 / 1                   | 1 / 1                   | 1 / 1              |
| `fd_write`                          | 1                             | 1                       | 10                      | 1                  |
| `proc_exit`                         | 1                             | 1                       | 1                       | 1                  |
| **distinct / total**                | **16 / 66**                   | **9 / 23**              | **9 / 360**             | **9 / 23**         |

Tiny surface: at most 16 distinct preview1 functions. Per-run call count is
dominated by `clock_time_get` (GHC RTS timer) which scales with work, not I/O.
No `fd_readdir`, no `path_symlink`, no sockets, no `poll_oneoff`.

### (e) Windows path mapping (reasoning only — not testable here)

WASI preview1 guests see POSIX paths rooted at preopen names; there is no drive
letter concept and `\` is a legal filename character, not a separator.

- **node:wasi**: `preopens` maps a guest path to a _host_ path and Node accepts a
  Windows host path on the right. `C:\proj\sub\main.sh` becomes
  `preopens: { '/': 'C:\\proj' }` + argument `/sub/main.sh` + `env.PWD='/sub'`.
  Guest paths must use `/`; the drive letter is absorbed into the preopen. A
  document on another drive needs a second preopen (e.g. `'/d'` -> `'D:\\'`)
  because one guest root cannot span two drives. UNC paths need their own preopen.
- **browser_wasi_shim + `lib-shim-fs.mjs`**: mapping is entirely in our JS.
  `HostPreopenDirectory('/', 'C:\\proj')` works because `nodePath.resolve` does
  the host join and the containment check (`startsWith(root + path.sep)`) stays
  correct on Windows. Case sensitivity differs (shellcheck compares guest paths
  case-sensitively, the host FS does not), which can matter for
  `# shellcheck source=` directives differing only in case.
- In both cases shellcheck's `file` field carries the **guest** path, so the
  extension must translate guest -> host before creating diagnostics. Moot in
  stdin mode (`file` is `"-"`).

---

## 5. Q-C Performance

All timings below use `performance.now()`, milliseconds, one decimal unless the
source script printed two. "cold" = first run in a fresh process for that
scenario; N and warmup counts are noted per benchmark. Primary node is
**22.23.2**; 24.15.0 numbers are given alongside where run. **Node 20.20.2 is
not usable**: the `mise` install directory exists but is empty (no `bin/node`)
— installing it would be a global install, out of scope for this spike, so
Node 20 numbers are absent from every table below (see "Could not determine").

### 5.1 `WebAssembly.compile` wall time (`bench-compile.mjs`)

| node    | wasm              | compile #1 (cold) | compile #2 median (2..6) | `new Module` #1 (cold) | `new Module` #2 median (2..6) |
| ------- | ----------------- | ----------------- | ------------------------ | ---------------------- | ----------------------------- |
| 22.23.2 | command (7.65 MB) | 55.6              | 29.6                     | 13.1                   | 6.7                           |
| 22.23.2 | reactor (17.0 MB) | 73.2              | 52.4                     | 19.8                   | 15.5                          |
| 24.15.0 | command (7.65 MB) | 53.8              | 28.0                     | 12.8                   | 6.3                           |
| 24.15.0 | reactor (17.0 MB) | 80.2              | 53.8                     | 24.9                   | 18.8                          |

`WebAssembly.compile` (async, background-thread-eligible) and `new
WebAssembly.Module` (sync) are close in wall time on this box; the sync form
is not dramatically faster per-call here, but note `new Module` #1 (13 ms for
command) roughly matches the `compile(sync)` startup cost `bench-lint.mjs`
prints at the top of §5.2's runs. Compile scales with wasm size (reactor is
~2.2x the bytes and ~1.6-1.8x the compile time). Second+ compiles in the same
process are consistently faster than the first (V8 warms its own compilation
pipeline), by roughly 30-45%.

### 5.2 Command build per-lint, Module reused, fresh Instance+WASI per run (`bench-lint.mjs`, Node 22.23.2, N=25, warmup=3)

stdin input, `-f json1 -s bash -`, one `WebAssembly.Module` compiled once
(50.7 ms, printed at startup) and reused for every run; each run gets a fresh
`Instance` and fresh WASI object (node:wasi: no preopens).

| host      | size   | cold total | median total | p95 total | median instantiate | median `_start` | rc  | out bytes |
| --------- | ------ | ---------- | ------------ | --------- | ------------------ | --------------- | --- | --------- |
| node:wasi | small  | 188.1      | 70.7         | 83.9      | 15.8               | 54.5            | 1   | 4735      |
| node:wasi | medium | 721.3      | 685.3        | 796.4     | 19.8               | 671.7           | 1   | 52073     |
| node:wasi | large  | 4487.8     | 4320.3       | 4490.0    | 21.8               | 4289.1          | 1   | 259946    |
| shim      | small  | 81.2       | 69.4         | 89.4      | 15.7               | 53.9            | 1   | 4735      |
| shim      | medium | 721.0      | 684.0        | 791.3     | 17.3               | 667.6           | 1   | 52073     |
| shim      | large  | 4135.9     | 4289.4       | 4443.2    | 22.9               | 4266.5          | 1   | 259946    |

`rc=1` on all rows is expected (all three scripts have findings). RSS at the
end of the whole run (6 x 28 runs on the same process) was 141.1 MiB.

Instantiate cost is flat (~16-23 ms) regardless of script size and near-identical
between node:wasi and the shim — it is dominated by linear-memory setup for the
7.65 MB command module, not by host-call plumbing. **`_start` dominates total
time and scales with script size**, not with host (node:wasi vs shim differ by
<3% at every size): small ~54 ms, medium ~670-685 ms (12.4x small), large
~4.27-4.29 s (78x small, 6.3x medium). This is the Go runtime + full shellcheck
parse/analysis running inside wasm, not I/O — see the `clock_time_get` counts in
§4(d) (336 calls on large stdin vs 14 on small) as a proxy for internal work.

**Repeated on Node 24.15.0** (N=20, warmup=3):

| host      | size   | cold total | median total | p95 total | median instantiate | median `_start` |
| --------- | ------ | ---------- | ------------ | --------- | ------------------ | --------------- |
| node:wasi | small  | 274.4      | 91.6         | 117.8     | 18.2               | 72.8            |
| node:wasi | medium | 934.4      | 892.2        | 966.8     | 24.0               | 857.4           |
| node:wasi | large  | 4877.8     | 4892.2       | 5353.8    | 28.0               | 4863.8          |
| shim      | small  | 90.4       | 78.4         | 93.7      | 18.0               | 60.8            |
| shim      | medium | 817.1      | 776.9        | 862.3     | 19.2               | 759.4           |
| shim      | large  | 5089.9     | 4885.9       | 5328.5    | 24.5               | 4867.2          |

**Node 24.15.0 is consistently slower than Node 22.23.2 for this workload**,
not faster: medium is ~24-30% slower (892.2/776.9 vs 685.3/684.0 ms),
large ~13-14% slower (4892.2/4885.9 vs 4320.3/4289.4 ms), instantiate is also
uniformly higher (18-28 ms vs 16-23 ms). This spike does not investigate why
(candidates include V8 version differences in Liftoff/TurboFan wasm codegen or
node:wasi implementation changes between the two Node versions) — it is
reported as measured, without attributing a cause.

### 5.3 V8 tier-up (`bench-lint.mjs` §C3, Node 22.23.2, fresh Module, large.sh, 20 runs)

```
node:wasi run#: 4391.4 4395.8 4157.8 4123.9 4264.5 4376.3 4328.5 4254.6 4084.8 4232.6 4185.8 4129.1 4530.0 4218.5 4321.0 4166.3 4588.8 4560.4 4468.4 4537.8
shim     run#: 4472.5 4470.7 4239.4 4152.2 4160.6 4470.6 4265.5 4360.8 4316.5 4204.0 4590.1 4173.8 4250.7 4425.3 4192.5 4161.2 4174.8 4221.3 4165.5 4278.1
```

Run #1 (4391 / 4473 ms) is **not** meaningfully slower than run #10 (4233 /
4204 ms) or run #20 (4538 / 4278 ms) — the series is flat noise (range ~4085-4589
ms, no monotonic warm-up trend) for both hosts. On large.sh the ~4.3 s of
`_start` work swamps any JIT tier-up effect that might exist at the instantiate
layer; each run gets a fresh `Instance`, so there is nothing here for V8 to tier
up across runs in the first place (the _compiled_ Module is reused, but Liftoff
vs TurboFan tiering applies to the wasm code within one instantiation's
execution, and a 4+ second single execution has plenty of time to tier up
_within itself_ — this benchmark cannot separate "run 1 slower because cold"
from "no such effect exists" since both would need a much shorter workload than
large.sh to show a first-run penalty distinctly).

### 5.4 Kept-alive `worker_threads` Worker holding the Module (`bench-worker.mjs`, Node 22.23.2, N=20, HOST=node:wasi)

**C4a — long-lived worker, round trip measured from the main thread:**

Worker spawn + ready (module compiled in-worker from file) = 119.3 ms, of
which compile = 41.0 ms.

| size   | cold rtt | median rtt | p95 rtt | median in-worker | rc  |
| ------ | -------- | ---------- | ------- | ---------------- | --- |
| small  | 197.4    | 75.7       | 106.0   | 75.5             | 1   |
| medium | 728.4    | 683.6      | 821.3   | 682.9            | 1   |
| large  | 4328.8   | 4319.0     | 4799.1  | 4317.9           | 1   |

The postMessage round trip adds essentially nothing over the in-worker time
(median rtt vs median in-worker differ by <1 ms at every size) — the same
`_start`-dominated cost as §5.2, just relocated off the main thread.

**C4b — can a compiled `WebAssembly.Module` be postMessage'd main -> worker?**
**Yes.** `spawnWorker({ module: mod })` succeeds (`sawModule=true`); the
worker's own "compile" step becomes 0.01 ms (it receives the already-compiled
Module via structured clone, doesn't recompile). Main-thread compile was 31.2
ms, worker-ready 87.9 ms, first lint on the transferred module (large) rtt =
4450.0 ms (in the same range as C4a's large numbers — using a transferred
Module costs nothing extra per lint).

**C4d — fresh Worker + compile, per lint (large), 8 iterations:**

```
4490, 4645, 4267, 5557, 5465, 4948, 4506, 4680 ms   median = 4679.8
```

vs the kept-alive worker's 4319 ms median for large — spinning up a fresh
Worker and recompiling per call costs roughly **+360 ms median** (worker
startup + compile) on top of the same `_start` cost, and is noticeably noisier
(range 4267-5557 ms vs kept-alive's 4319-4799 ms p95).

**D — terminate + respawn cost**, 5 iterations, `terminate ms / respawn+recompile ms`:

```
6.9/96  6.1/97  6.2/73  5.7/72  5.9/77
```

`worker.terminate()` itself is fast (~6 ms). Spawning a new worker and
recompiling the command module from bytes inside it costs ~72-97 ms — this is
the effective "next lint result after cancellation" latency floor before the
new worker even starts its `_start` for whatever script triggered it (see
§6 for the same measurement framed as a robustness question).

**Same run repeated with HOST=shim** (worker uses `browser_wasi_shim` instead
of node:wasi internally, same postMessage transport):

| size   | cold rtt | median rtt | p95 rtt | median in-worker | rc  |
| ------ | -------- | ---------- | ------- | ---------------- | --- |
| small  | 205.3    | 70.4       | 88.3    | 69.2             | 1   |
| medium | 805.3    | 734.3      | 837.8   | 733.4            | 1   |
| large  | 4501.1   | 4392.6     | 4748.6  | 4391.9           | 1   |

Worker ready = 120.4 ms (compile 47.9 ms). C4b (transferred Module): worker
ready = 73.9 ms, workerCompile = 0.01 ms, first lint (large) rtt = 4503.9 ms.
C4d (fresh worker + compile per lint, large, 8 iter): `4678, 4564, 4445, 4485,
4694, 4658, 4606, 4394` ms, median = 4606.3. D (terminate/respawn, 5 iter):
`6.6/80  9.6/75  5.5/76  5.6/100  5.6/90`. All numbers track the node:wasi
run within noise (<5%) — the worker/postMessage layer is host-agnostic, as
expected since §5.2 already showed node:wasi vs shim differ by <3% in-process.

### 5.5 Native baseline (`bench-native.mjs`, Node 22.23.2, `child_process.spawn`, N=25, warmup=3)

`shellcheck -f json1 -s bash -`, stdin, one spawn per run:

| size   | cold   | median | p95    | rc  | out bytes |
| ------ | ------ | ------ | ------ | --- | --------- |
| small  | 47.6   | 23.5   | 39.0   | 1   | 4735      |
| medium | 173.5  | 180.7  | 207.6  | 1   | 52073     |
| large  | 1160.5 | 1112.5 | 1223.1 | 1   | 259946    |

**Repeated on Node 24.15.0** (same native binary, only the spawning Node
version differs — this measures `child_process.spawn` overhead, not the
native binary itself, which is identical in both runs):

| size   | cold   | median | p95    | rc  | out bytes |
| ------ | ------ | ------ | ------ | --- | --------- |
| small  | 49.2   | 22.4   | 36.8   | 1   | 4735      |
| medium | 194.5  | 197.9  | 246.7  | 1   | 52073     |
| large  | 1206.2 | 1180.7 | 1268.2 | 1   | 259946    |

Small/large are within noise of Node 22 (22.4 vs 23.5 ms; 1180.7 vs 1112.5 ms,
~6% higher); medium is ~9.5% higher (197.9 vs 180.7 ms). Unlike §5.2's wasm
numbers, these differences are small enough to be consistent with normal
spawn-overhead noise rather than a clear version effect — the native binary
itself does the identical work regardless of which Node spawned it.

Native is faster than the command-wasm build at every size (§5.2): small
~2.3-3.0x, medium ~3.8x, large ~3.9x (node:wasi median 4320.3 / native median
1112.5 = 3.88x). The gap widens with script size, consistent with §5.2's
finding that wasm cost is dominated by in-wasm compute (GHC RTS + analysis),
not I/O.

> **Correction (verified against `wasilibs/go-shellcheck`'s
> `buildtools/wasm/Dockerfile`):** an earlier draft of this section claimed the
> command wasm build was a _Go reimplementation_ of shellcheck. That is wrong.
> The Dockerfile bootstraps `ghc-wasm-meta` and runs `wasm32-wasi-cabal build
shellcheck` on upstream ShellCheck's own Haskell source; Go (`wazero`) is only
> the host runtime that _their_ CLI uses to execute the module, and is not
> involved here at all. So this **is** an apples-to-apples comparison: the same
> Haskell ShellCheck, native vs wasm. The ~3.9x is wasm/WASI + GHC-wasm-backend
> codegen overhead, with no language-reimplementation confound.

### 5.6 Reactor on a long-lived instance (`bench-reactor2.mjs`, `qr-*.mjs`, Node 22.23.2, fixed init)

**Reproducing the package's own (broken) init — `qr-min.mjs`, `qr-bisect.mjs`, `qr-custom.mjs hs_init`:**

The published entry point (`createShellCheck()` from `shellcheck-wasm`) works
for a _single_ call, then breaks on the next call on the same instance:

```
call#1 small: OK 14 results  223.0ms
call#2 small: CAUGHT RuntimeError: table index is out of bounds
[shellcheck stderr] <unknown>: schedule: re-entered unsafely.
[shellcheck stderr]    Perhaps a 'foreign import unsafe' should be 'safe'?
```

This is unrelated to script size (small.sh alone reproduces it on call #2;
`qr-bisect.mjs`'s "medium FAILs" was actually the sequence's 2nd call, not a
size effect). Root cause, confirmed by reading `node_modules/shellcheck-wasm/dist/runtime/node.mjs`:
the package's own loader calls `wasi.initialize({exports:{memory}})` +
`exports.hs_init(0, 0)` instead of calling the wasm reactor's real
`_initialize()` export. `hs_init(0,0)` starts the GHC RTS without properly
registering it as a WASI reactor entry point, so the _second_ call re-enters
the Haskell scheduler while it still thinks it's inside the first call
("re-entered unsafely").

**The fix — `qr-custom.mjs initialize`, `lib-reactor.mjs`:** call
`instance.exports._initialize()` (the standard wasm reactor init function)
instead of `wasi.initialize()` + `hs_init(0,0)`. Same published `.wasm` and
`.js` glue file, no rebuild:

```
called _initialize()
  call#1 small: OK 14 223.0ms
  call#2 small: OK 14 73.5ms
  call#3 small: OK 14 56.2ms
  call#4 small: OK 14 55.2ms
  call#5 small: OK 14 55.1ms
```

**A consumer can apply this fix with their own loader, without rebuilding the
wasm.** `lib-reactor.mjs` does exactly that: it reads the same
`node_modules/shellcheck-wasm/dist/{shellcheck.wasm,shellcheck.js}` the
package ships, and only changes the init call. This is not usable through the
package's public API (`createShellCheck`/`lint`/`lintWithOptions` are not
exported with a way to override initialization) — a consumer needs to bypass
`shellcheck-wasm`'s `index.mjs`/`runtime/node.mjs` entirely and drive the wasm

- glue + `@bjorn3/browser_wasi_shim` directly, as `lib-reactor.mjs` does.

**Cold init and per-call latency** (fixed init, `bench-reactor2.mjs`, N=25, warmup=3):

```
cold load: total=93.6 ms (compile+instantiate=89.3, _initialize=2.8)
getVersion() = "shellcheck-wasm-0.1.0 (ShellCheck 0.11.0)"
```

| size   | cold   | median | p95    | results |
| ------ | ------ | ------ | ------ | ------- |
| small  | 199.2  | 50.1   | 57.0   | 14      |
| medium | 856.2  | 780.0  | 917.8  | 155     |
| large  | 5717.7 | 4942.3 | 5735.5 | 766     |

Reactor per-call cost (median, after warmup) is in the same order of magnitude
as the command build's `_start` cost (§5.2) — small is faster (50.1 vs 54.5
ms), medium is slower (780.0 vs 671.7-682.9 ms), large is slower (4942.3 vs
4266.5-4392.6 ms). The "fast" characterization in the previous agent's note
refers to fixing the _crash_, not to the reactor being faster than the
command build in steady state — on this data it is not, at medium/large sizes.

**Correctness vs native json1** (`code@line:col` multiset, all three sizes):
**identical** (small 14/14, medium 155/155, large 766/766, confirmed exact
set match, not just count). The **`fix` payload schema differs** from native
json1 even though results are otherwise equivalent: native uses
`{column, endColumn, line, endLine, precedence, insertionPoint, replacement}`,
the reactor uses `{startColumn, endColumn, startLine, endLine, text}` — same
semantic edit, different field names, so **not byte-identical**, unlike the
command build (§3) which is byte-identical to native.

**Options accepted** (`node_modules/shellcheck-wasm/dist/shared/shellcheck-wasm.*.d.ts`,
confirmed against the _fixed_ reactor):

| option                    | accepted                                 | verified behavior                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell`                   | `'bash'\|'sh'\|'dash'\|'ksh'\|'busybox'` | used in every benchmark call                                                                                                                                                                                                                                                                                                                        |
| `severity`                | `'error'\|'warning'\|'info'\|'style'`    | declared in types; an invalid string value was silently accepted (no error, no visible effect) rather than validated                                                                                                                                                                                                                                |
| `exclude` / `include`     | number arrays                            | declared in types, not separately re-verified here                                                                                                                                                                                                                                                                                                  |
| `externalSources`         | boolean                                  | works together with `files` (see below)                                                                                                                                                                                                                                                                                                             |
| `sourcePaths`             | string array                             | declared; did not change source-resolution outcomes in ad-hoc testing                                                                                                                                                                                                                                                                               |
| `files`                   | `Record<path, content>` (virtual files)  | **confirmed working** for `source`-following: `source lib.sh` + `files: {'./lib.sh': ...}` resolves and suppresses SC1091 — but the key must match the shell's own path resolution _exactly_ (e.g. a `source ./lib.sh` directive needs key `././lib.sh` when `sourcePaths` is also set); mismatched keys fail silently with SC1091 "File not found" |
| `.shellcheckrc` (rc file) | **not supported**                        | tried `files` with keys `.shellcheckrc`, `./.shellcheckrc`, `script.sh/.shellcheckrc` against a script with an unused variable (SC2034) that only a `disable=SC2034` rc file would suppress — SC2034 fired in every case; the API has no rc-file discovery mechanism                                                                                |

**Can it read files at all?** No real filesystem access: the reactor's WASI
fds are constructed from `OpenFile(new File([]))` / `ConsoleStdout` in
`lib-reactor.mjs` (mirroring the package's own loader) — there is no
preopened directory, so nothing outside the `files` virtual map is reachable.
Source-following works only through the buffer-only `files` map; `.shellcheckrc`
discovery is not implemented against that map at all (see above) — it is a
pure in-memory/buffer API, not a filesystem-backed one.

**Memory growth over 200 consecutive calls with medium.sh:**

| call | rss       | wasm `memory.buffer.byteLength` | heapUsed |
| ---- | --------- | ------------------------------- | -------- |
| 1    | 162.4 MiB | 44.8 MiB                        | 22.6 MiB |
| 50   | 161.2 MiB | 44.8 MiB                        | 12.7 MiB |
| 100  | 162.6 MiB | 44.8 MiB                        | 13.3 MiB |
| 200  | 139.8 MiB | 44.8 MiB                        | 14.3 MiB |

`memory.buffer.byteLength` (the wasm linear memory) is exactly flat across all
200 calls — no wasm-side memory growth. Process RSS fluctuates within a
~23 MiB band with no upward trend (it is _lower_ at call 200 than at call 1),
consistent with GC timing noise rather than a leak. **No memory growth
observed** over this window.

**Does a call after a failed/throwing call still work?** This could not be
tested as originally framed: neither an invalid enum value for `severity`
nor structurally malformed options JSON passed directly to the raw
`lintWithOptions` export (bypassing the JS wrapper's `JSON.stringify`)
produced a thrown exception — both were silently tolerated (ignored / treated
as defaults) rather than raising an error, so no genuine "failed call" could
be induced through the public API surface with the _fixed_ init. Every
sequence attempted (good calls interleaved with these degenerate inputs)
continued to work. The one reproducible failure mode found (§ above,
`hs_init(0,0)` re-entrancy) is a **permanent** failure — after it fires, the
RTS is left in a broken state and every subsequent call on that instance
fails the same way (confirmed by `qr-seq.mjs`/`qr-bisect.mjs` runs where the
2nd call always failed once the 1st had); it is not a transient error that a
following call recovers from, and it happens with the package's own,
unmodified init path.

### 5.7 Peak RSS (Node 22.23.2, idle vs 20 lints of large.sh)

| scenario                            | rssBase  | after compile/load | peak during 20 runs |
| ----------------------------------- | -------- | ------------------ | ------------------- |
| idle node (no wasm loaded)          | –        | –                  | 19.5 MiB            |
| command build, node:wasi, large x20 | 23.8 MiB | 43.9 MiB           | 160.4 MiB           |
| command build, shim, large x20      | 23.6 MiB | 43.9 MiB           | 124.6 MiB           |
| reactor, large x20                  | 23.6 MiB | 73.5 MiB           | 138.4 MiB           |

The reactor's cold load footprint (73.5 MiB, includes GHC RTS init) is larger
than the command build's compile footprint (43.9 MiB), but the command build's
_peak while running_ is larger under node:wasi (160.4 MiB, each run gets a
fresh `Instance` + fresh WASI object as required by §5.2's methodology — a
fresh Instance re-allocates the module's initial linear memory each time)
than either the shim host (124.6 MiB — the shim's lighter-weight WASI
implementation appears to add less per-Instance overhead) or the reactor
(138.4 MiB, one Instance reused for all 20 calls, so this is the Haskell
heap's high-water mark under repeated calls rather than Instance churn).

---

## 6. Q-D Robustness

### Exit code / completion surfacing (`qd-robust.mjs`, command build, Node 22.23.2)

**node:wasi, `returnOnExit: true`:**

| case                            | `wasi.start()` return | thrown | stderr / stdout                                                     |
| ------------------------------- | --------------------- | ------ | ------------------------------------------------------------------- |
| clean.sh (0 findings)           | `0`                   | none   | outLen=16 (`{"comments":[]}`)                                       |
| small.sh (14 findings)          | `1`                   | none   | outLen=4735                                                         |
| bad CLI flag (`--no-such-flag`) | `3`                   | none   | stderr: `unrecognized option --no-such-flag` + usage text           |
| missing input file, no preopens | `2`                   | none   | stderr: `openBinaryFile: does not exist`; stdout: `{"comments":[]}` |

`returnOnExit: false` (node:wasi's default) calls `process.exit(code)` directly
from inside `wasi.start()` — this was **not** exercised inline since it would
kill the measuring process; `returnOnExit: true` is required to observe the
exit code in-process at all, which is why every other benchmark in this spike
uses it.

**browser_wasi_shim:** `wasi.start(inst)` also **returns** the exit code
(clean -> `0`, small -> `1`), matching node:wasi's `returnOnExit: true`
behavior — it does not throw for a normal exit. It **does** throw if you skip
`wasi.start()` and call `_start()` on the instance directly: this throws
`WASIProcExit` (`e instanceof WASIProcExit === true`, `e.code` holds the exit
code) — `wasi.start()` is a thin wrapper that catches exactly this exception
and returns `.code` instead of propagating it.

So: **exit code 1 ("issues found") is a normal, non-throwing return value on
both hosts** as long as you call the documented entry point (`wasi.start()`
for the shim, `returnOnExit:true` + `wasi.start()` for node:wasi). Syntax-error
scripts were not separately distinguished from "issues found" in this
spike — shellcheck reports parse errors as findings (still rc=1), not a
distinct exit code; the distinct **non-1** codes found were CLI-usage errors:
**rc=2** for a missing/unreadable input file, **rc=3** for an unrecognized
flag. (rc=4 was not observed or specifically triggered.)

### Instance reuse and failure isolation (`qd-robust.mjs` D4/D5)

- **Calling `_start()` twice on the same `Instance` is unsafe**: the first
  call succeeds (rc=1, valid output), the second throws
  `RuntimeError: unreachable` and produces no output (`out2Len=0`, not valid
  JSON). This is the command-build analogue of the reactor's `hs_init`
  re-entrancy bug in §5.6 — both wasm builds embed a runtime (Go / GHC) that
  is not safe to re-enter after `_start`/reactor-call completes, and this is
  exactly why every benchmark here uses a **fresh Instance per run** (§5.2's
  methodology, not an arbitrary choice).
- **A failed run does not poison the Module**: forcing a chdir-failure run
  (`env.PWD` pointing outside any preopen) and then running a normal fresh
  `Instance` from the _same compiled Module_ afterwards succeeds normally
  (rc=1, full output). Failure isolation holds at the Module level even
  though it does not hold at the Instance level.

### Cancelling an in-flight run

**No cancellation mechanism was found other than killing the whole execution
context.** Once `wasi.start()`/`_start()` is running, it is synchronous wasm
execution on that thread — there is no `AbortSignal`/interrupt hook in either
node:wasi or `@bjorn3/browser_wasi_shim`, and §5.4/D confirmed a completed
`Instance` cannot be reused for a second call anyway, so "let it finish, then
discard the result" is not free of that same Instance-reuse hazard for a
_retried_ run. In a `worker_threads` setup the only mechanism available is
`worker.terminate()` (kills the whole worker thread, including its in-flight
wasm execution).

**Time to a usable next lint result after `worker.terminate()`**
(`bench-worker.mjs` §D, terminate mid-run of large.sh, then spawn a fresh
worker, Node 22.23.2, node:wasi, 5 iterations):

|       | terminate | respawn worker, recompile Module from bytes |
| ----- | --------- | ------------------------------------------- |
| run 1 | 6.9 ms    | 96 ms                                       |
| run 2 | 6.1 ms    | 97 ms                                       |
| run 3 | 6.2 ms    | 73 ms                                       |
| run 4 | 5.7 ms    | 72 ms                                       |
| run 5 | 5.9 ms    | 77 ms                                       |

`terminate()` itself is fast and consistent (~6-10 ms across both host
variants, §5.4). Getting a new worker with a **recompiled** Module ready
costs ~72-100 ms. §5.4/C4b already showed a compiled `WebAssembly.Module` can
be `postMessage`'d main -> worker and the worker-side "compile" of a
transferred Module is ~0.01 ms — so if the main thread keeps its own copy of
the compiled Module (it can, structured-clone of a `WebAssembly.Module` does
not consume/invalidate the original), a terminate+respawn+re-arm sequence
could in principle skip the ~40-48 ms recompile-from-bytes portion of that
72-100 ms and only pay worker-thread-startup cost (~74-88 ms worker-ready
time was observed for the postMessage path in §5.4/C4b, in the same range as
recompiling — this spike's data does not show a clear win from postMessage-ing
a pre-kept Module during exactly this respawn sequence, only that both paths
are of comparable, roughly 75-100 ms, magnitude). Either way, **the
"next lint result" clock also has to add a fresh run's own `_start`/`_initialize`
time on top of this respawn cost** (§5.2/§5.6) — for large.sh that dwarfs the
respawn cost itself (~4.3 s vs ~0.1 s).

---

## 7. Summary table

All Node 22.23.2 unless noted. "cold start" = first-in-process load/init cost
(compile+instantiate, or reactor `_initialize`, or process spawn for native);
"per-lint median" excludes that cold cost (steady-state, N>=20, 3 warmups).
Native/command/shim ratios use **large.sh median** vs native's large.sh median
(1112.5 ms).

|                                         | cold start                   | median small | median medium | median large | p95 large | ratio vs native (large, median) | peak RSS (20x large)                                     |
| --------------------------------------- | ---------------------------- | ------------ | ------------- | ------------ | --------- | ------------------------------- | -------------------------------------------------------- |
| native spawn                            | 47.6 ms (cold run)           | 23.5 ms      | 180.7 ms      | 1112.5 ms    | 1223.1 ms | 1.0x                            | not measured (short-lived process)                       |
| command + node:wasi                     | 188.1 ms (cold run)          | 70.7 ms      | 685.3 ms      | 4320.3 ms    | 4490.0 ms | 3.88x                           | 160.4 MiB                                                |
| command + browser_wasi_shim             | 81.2 ms (cold run)           | 69.4 ms      | 684.0 ms      | 4289.4 ms    | 4443.2 ms | 3.86x                           | 124.6 MiB                                                |
| command + shim, kept-alive Worker (rtt) | 120.4 ms (worker ready)      | 70.4 ms      | 734.3 ms      | 4392.6 ms    | 4748.6 ms | 3.95x                           | not separately measured (worker process shares main RSS) |
| reactor (fixed init)                    | 93.6 ms (`_initialize` load) | 50.1 ms      | 780.0 ms      | 4942.3 ms    | 5735.5 ms | 4.44x                           | 138.4 MiB                                                |

Notes on the table:

- "cold start" for the two command-build rows is the **first full run**
  (compile-at-startup + instantiate + `_start`) since that is what a
  first-ever lint in a fresh process actually costs; steady-state Module
  compile alone was 50.7 ms (§5.2) / worker Module compile 41.0-47.9 ms (§5.4).
- The command build (both hosts) and the kept-alive-Worker variant are all
  within ~4% of each other at every size — the host/transport is not where
  the time goes; §5.2/§5.4's `_start`-dominated cost is.
- The reactor is the only row with an architecturally different cost curve:
  faster than the command build at small (50.1 vs ~69-70 ms) but slower at
  medium and large — see §5.6.
- Every row is the **same** program (upstream Haskell ShellCheck 0.11.0);
  both wasm builds come from GHC's wasm32-wasi backend, so all ratios here are
  pure runtime/codegen overhead — see the correction note in §5.5.
- **Node 24.15.0**: repeated for items 2 (command build, §5.2) and 5 (native,
  §5.5). Command-build large median was ~13-14% _slower_ on 24.15.0
  (4892.2/4885.9 ms node:wasi/shim) than on 22.23.2 (4320.3/4289.4 ms);
  native was within ~6% (noise). Items 4 (worker) and 6 (reactor) were not
  repeated on 24.15.0 — see "Could not determine" below.

**Could not determine:**

- **Node 20.20.2 numbers for any benchmark.** The `mise` install directory
  (`~/.local/share/mise/installs/node/20.20.2`) exists but is empty (no
  `bin/node`); installing it was out of scope (no global installs per the
  spike's constraints).
- **Node 24.15.0 repeats of the worker and reactor benchmarks (items 4, 6).**
  §5.1 (compile time), §5.2 (command build per-lint) and §5.5 (native) were
  run on both 22.23.2 and 24.15.0; §5.4 (worker), §5.6 (reactor), §5.7 (RSS)
  and §6 (robustness) were only run on 22.23.2 due to time — each full pass
  (command build alone) takes on the order of several minutes because
  large.sh's `_start`/reactor-call cost is ~4.3-4.9 s per run and N>=20 is
  required.
- **Whether `_start()`/reactor-call re-entrancy (Instance/RTS reuse after
  one completed call) is fixable**, e.g. by resetting some RTS/runtime state
  between calls on the same Instance rather than always allocating a fresh
  Instance — not investigated; this spike only established that reuse
  currently fails (`RuntimeError: unreachable` for the command build,
  `schedule: re-entered unsafely` for the reactor with the broken init).
- **A definitive symbol/root cause for the §2 node:wasi + `preopens`
  SIGSEGV** on Node 22.23.2 — the crashing RIP could not be reliably
  symbolised on this box (32-bit `readelf`, no `gdb`, no debug symbols); see
  §2 for what was ruled out.
- **Whether postMessage-ing an already-compiled Module measurably beats
  recompiling from bytes for the terminate+respawn cancellation path
  specifically** (§6) — both were in the same ~75-100 ms range in the data
  gathered here; a benchmark isolating exactly that comparison (same
  respawn sequence, A/B on module-transfer vs recompile) was not built.
- **`severity`/malformed-options input validation for the reactor** (§5.6):
  neither an invalid `severity` enum value nor malformed raw JSON passed to
  the reactor's `lintWithOptions` export produced a thrown exception, so
  "does a call after a _failed_ call still work" could not be tested via any
  input this spike found that actually fails — only the pre-existing
  `hs_init` re-entrancy bug (a _different_ kind of failure, not an
  input-validation error) was found to be reproducibly broken, and it is
  permanent, not recoverable by a later call.
- **Native baseline peak RSS** — `bench-native.mjs` spawns one short-lived
  child process per run and measures wall time only; no RSS sampling of the
  native child process was implemented.

---
