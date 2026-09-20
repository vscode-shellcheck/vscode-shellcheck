import { Fd, WASI, wasi as wasiDefs } from "@bjorn3/browser_wasi_shim";
import { HostPreopenDirectory } from "./host-fs.js";

/** ShellCheck reads its own name out of argv[0]. */
const ARGV0 = "shellcheck";

export interface WasiPreopen {
  /** Path the guest sees this directory at, normally "/". */
  readonly guestName: string;
  /** Host directory to expose, read-only. */
  readonly hostRoot: string;
}

export interface WasiRunRequest {
  /** Compiled once by the caller and reused; instantiation is per run. */
  readonly module: WebAssembly.Module;
  /** argv without argv[0], which the host supplies. */
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  /** `PWD` here is what emulates the native cwd. */
  readonly env?: Readonly<Record<string, string>>;
  readonly preopen?: WasiPreopen;
}

export interface WasiRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * The only surface callers use, so the `node:fs`-backed implementation below
 * can be replaced by a zero-dependency or browser-filesystem one without
 * touching them. Running is synchronous: the guest is a wasm command that
 * runs to completion on the calling thread.
 */
export interface WasiHost {
  run(request: WasiRunRequest): WasiRunResult;
}

/** WASI host built on @bjorn3/browser_wasi_shim and synchronous `node:fs`. */
export function createShimWasiHost(): WasiHost {
  return new ShimWasiHost();
}

interface WasiCommandInstance {
  readonly exports: {
    readonly memory: WebAssembly.Memory;
    readonly _start: () => unknown;
  };
}

class ShimWasiHost implements WasiHost {
  public run(request: WasiRunRequest): WasiRunResult {
    const stdout = new MemoryOutput();
    const stderr = new MemoryOutput();
    const fds: Fd[] = [new MemoryInput(request.stdin), stdout, stderr];

    const preopen = request.preopen
      ? new HostPreopenDirectory(
          request.preopen.guestName,
          request.preopen.hostRoot,
        )
      : undefined;
    if (preopen) {
      fds.push(preopen);
    }

    const env = Object.entries(request.env ?? {}).map(
      ([key, value]) => `${key}=${value}`,
    );
    // The options argument is mandatory: the shim calls
    // debug.enable(options.debug), and enable(undefined) switches logging on
    // for a module-global singleton shared by every WASI instance.
    const wasi = new WASI([ARGV0, ...request.args], env, fds, { debug: false });

    try {
      // A fresh Instance per run is mandatory: _start on a used Instance
      // throws RuntimeError: unreachable.
      const instance = new WebAssembly.Instance(request.module, {
        wasi_snapshot_preview1: wasi.wasiImport as WebAssembly.ModuleImports,
      });
      // start() returns the exit code; a non-zero one is how ShellCheck
      // reports findings, not a failure.
      const exitCode = wasi.start(instance as unknown as WasiCommandInstance);
      return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
    } finally {
      preopen?.dispose();
    }
  }
}

/** Serves the document bytes as stdin, then reports EOF. */
class MemoryInput extends Fd {
  private position = 0;

  public constructor(private readonly bytes: Uint8Array) {
    super();
  }

  public fd_fdstat_get(): { ret: number; fdstat: wasiDefs.Fdstat | null } {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0),
    };
  }

  public fd_fdstat_set_flags(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public fd_filestat_get(): {
    ret: number;
    filestat: wasiDefs.Filestat | null;
  } {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      filestat: new wasiDefs.Filestat(
        0n,
        wasiDefs.FILETYPE_CHARACTER_DEVICE,
        BigInt(this.bytes.length),
      ),
    };
  }

  public fd_read(size: number): { ret: number; data: Uint8Array } {
    const end = Math.min(this.position + size, this.bytes.length);
    const data = this.bytes.slice(this.position, end);
    this.position = end;
    return { ret: wasiDefs.ERRNO_SUCCESS, data };
  }

  public fd_seek(): { ret: number; offset: bigint } {
    return { ret: wasiDefs.ERRNO_SPIPE, offset: 0n };
  }

  public fd_write(_data: Uint8Array): { ret: number; nwritten: number } {
    return { ret: wasiDefs.ERRNO_ROFS, nwritten: 0 };
  }

  public fd_close(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }
}

/** Captures stdout or stderr. */
class MemoryOutput extends Fd {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  public fd_fdstat_get(): { ret: number; fdstat: wasiDefs.Fdstat | null } {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0),
    };
  }

  public fd_fdstat_set_flags(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public fd_filestat_get(): {
    ret: number;
    filestat: wasiDefs.Filestat | null;
  } {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      filestat: new wasiDefs.Filestat(
        0n,
        wasiDefs.FILETYPE_CHARACTER_DEVICE,
        BigInt(this.length),
      ),
    };
  }

  public fd_write(data: Uint8Array): { ret: number; nwritten: number } {
    this.chunks.push(data.slice());
    this.length += data.length;
    return { ret: wasiDefs.ERRNO_SUCCESS, nwritten: data.length };
  }

  public fd_close(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public text(): string {
    const buffer = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(buffer);
  }
}
