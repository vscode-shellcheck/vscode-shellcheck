# node:wasi + preopens long-run soak — results

Question: is `node:wasi` with `preopens` safe for a long-lived VS Code
extension host on **Node 24**? All runs: one compiled `WebAssembly.Module`
reused, config exactly as specified (`args: [...,'-']`, `env:{PWD:'/proj/sub'}`,
`preopens:{'/': fixture}`, fresh stdin/stdout/stderr fds per run). Scripts in
`/tmp/shellcheck-wasm-spike/soak/*.mjs`; raw logs `exp*.log`/`exp*.stdout` in
the same directory.

| #   | Config                                                 | Node    | Runs completed                                                                    | Exit         | fd @1/100/500/1000/2000                                                                                          | rss @ same points (MiB)                           |
| --- | ------------------------------------------------------ | ------- | --------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | main thread, preopens                                  | 24.15.0 | 2000/2000                                                                         | 0            | 20/218/1018/2018/4018                                                                                            | 67.9/147.8/160.8/155.5/163.8                      |
| 2   | main thread, preopens, `--expose-gc` + `gc()` every 50 | 24.15.0 | 2000/2000                                                                         | 0            | same growth as #1; `freed=0` at all 40 gc checkpoints                                                            | 69.5→~110-114 (flatter, GC also reaps JS garbage) |
| 3   | 1 kept-alive Worker, preopens                          | 24.15.0 | 2000/2000                                                                         | 0            | 24/222/1022/2022/4022 (measured in worker)                                                                       | 79.0/172.7/210.5/209.2/200.9                      |
| 4   | Worker recycled every 200 runs                         | 24.15.0 | 2000/2000                                                                         | 0            | main-process fd after each recycle: 218/418/618/818/1018/1218/1418/1618/1818/2018 (net +1/run despite recycling) | 130-160, flat across cycles                       |
| 5   | main thread, preopens, `ulimit -n` forced to 256       | 24.15.0 | 119/N (first failure run=120)                                                     | 1 (uncaught) | fd=218 @ run 100, then EMFILE                                                                                    | 127.9 @ run 100                                   |
| 6   | API inspection                                         | 24.15.0 | n/a                                                                               | n/a          | no close/dispose/destroy/release/finalize; no `Symbol.dispose`/`asyncDispose` on class, prototype, or instance   | n/a                                               |
| 7a  | main thread, preopens, 200 runs × 5 attempts           | 22.23.2 | 4/5 attempts SIGSEGV (exit 139), crash on run 2-3 every time                      | mixed        | —                                                                                                                | —                                                 |
| 7b  | 1 Worker, preopens, 200 runs × 5 attempts              | 22.23.2 | 3/5 attempts SIGSEGV (exit 139), whole process dies (worker shares address space) | mixed        | —                                                                                                                | —                                                 |
| 7c  | Node 20.20.2                                           | —       | not installed on this box (`mise` dir empty)                                      | —            | —                                                                                                                | **could not determine**                           |
| 8   | main thread, NO preopens, no PWD (control)             | 24.15.0 | 2000/2000                                                                         | 0            | 19/118/518/1018/2018                                                                                             | 67.5/136.8/153.3/146.9/155.6                      |

## Conclusions directly supported by the data

- **Node 24.15.0 never crashed** in any of experiments 1-5, 8 (main thread,
  worker, recycled worker, fd-exhausted) — thousands of `preopens` runs, zero
  SIGSEGV, consistent with REPORT.md §2's node22-vs-node24 split.
- **The fd leak is real, linear, and not preopens-specific in origin**: node:wasi
  leaks **1 fd/run with no preopens** (exp 8) and **2 fd/run with preopens**
  (exp 1, 3) — preopens adds exactly one extra leaked fd per run on top of a
  baseline leak present for every run regardless of preopens.
- **The leak is a hard leak, not deferred GC finalization**: forcing
  `global.gc()` every 50 runs (with refs dropped and a `setImmediate` tick
  first) released **zero** fds at all 40 checkpoints in a 2000-run test (exp 2).
- **No explicit release API exists** (exp 6): `WASI.prototype` only exposes
  `constructor, finalizeBindings, start, initialize, getImportObject`; the
  instance's only own property is `wasiImport` plus five internal `Symbol()`s;
  neither `Symbol.dispose` nor `Symbol.asyncDispose` is implemented anywhere
  in the chain, even though both symbols exist globally in this Node version.
  There is no way to reclaim the leaked fd(s) from JS other than killing the
  thread/process that holds them.
- **Worker threads provide no crash isolation**: a native-level crash inside
  a Worker's node:wasi call takes down the _entire process_ (observed as
  process exit 139 on Node 22, not a Worker `'error'`/`'exit'` event) — exp 3
  saw a clean `'exit'` event with code 0 only on the runs that didn't crash.
- **Worker recycling only halves the leak, it does not eliminate it**:
  `worker.terminate()` released ~204 of the ~400 fds accumulated per 200-run
  cycle (about half); net leak with recycling every 200 runs was still ~1
  fd/run over the full 2000-run test (exp 4) — recycling is a mitigation, not
  a fix.
- **fd exhaustion is a clean, catchable JS exception**, not a crash or silent
  wrong output: with `ulimit -n` forced to 256, the run at fd≈256 (run 120,
  matching the measured leak rate) threw a synchronous `Error: EMFILE: too
many open files` from `fs.openSync`, fully catchable. In our test the
  catch handler's own logging call then _also_ hit EMFILE and was uncaught,
  killing the process with exit code 1 (a plain JS exception exit, not a
  signal) — a reminder that error-handling code must not assume it has a
  free fd budget once EMFILE has been seen once.
- **Node 22.23.2 crashes at a high, non-deterministic rate whenever
  `preopens` is used**, both on the main thread (4/5 attempts) and inside a
  Worker (3/5 attempts) — confirms REPORT.md §2's finding and shows the
  worker_threads path does not avoid it.
- A libuv warning, `File descriptor N opened in unmanaged mode twice`, fired
  on almost every run (1999/2000) specifically in the Worker-thread
  experiments (3/4) on Node 24 but never in the main-thread experiments —
  a secondary symptom of the same fd/handle bookkeeping problem, worth
  tracking but its functional impact (if any) beyond the warning itself was
  not tested.

## Could not be determined

- Node 20.20.2 numbers (exp 7c): the `mise` install directory exists but has
  no `bin/node` on this box, consistent with REPORT.md §5. Not installed as
  instructed (out of scope for this spike).
- Whether the fd leak is bounded by anything other than `ulimit -n` (e.g. an
  internal cap) — not observed up to 4022 fds.
- The root cause / exact native code path of the Node 22 SIGSEGV (REPORT.md
  §2 already notes symbolisation was inconclusive; not re-attempted here).
- Long-run behavior beyond 2000 runs, or under real concurrent VS Code
  keystroke-burst load patterns (this soak used a tight sequential loop).

## Methodology note

`ulimit -Hn` (lowering the hard limit) via the bash builtin failed with
`EINVAL` in this sandbox even though the value (256) was below the existing
hard limit (1048576) — Node also unconditionally raises its soft limit back
to the hard limit at startup, so a soft-limit-only `ulimit -n 256` had no
effect on the running process. Experiment 5 instead applied
`prlimit --pid <pid> --nofile=256:256` to the already-running Node process
~150ms after launch, which reliably capped both soft and hard limits.
