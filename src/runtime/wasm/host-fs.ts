import fs from "node:fs";
import { Fd, wasi as wasiDefs } from "@bjorn3/browser_wasi_shim";
import { contains, fromGuest, normalizeRoot } from "./guest-path.js";

/** Bounds the host file descriptors a single run can hold open. */
const DEFAULT_MAX_OPEN_FILES = 256;

/** preview1 `lookupflags::symlink_follow`, which the shim does not export. */
const LOOKUPFLAGS_SYMLINK_FOLLOW = 1;

type FdstatResult = { ret: number; fdstat: wasiDefs.Fdstat | null };
type FilestatResult = { ret: number; filestat: wasiDefs.Filestat | null };
type ReadResult = { ret: number; data: Uint8Array };
type SeekResult = { ret: number; offset: bigint };
type OpenResult = { ret: number; fd_obj: Fd | null };
type ReaddirResult = { ret: number; dirent: wasiDefs.Dirent | null };
type WriteResult = { ret: number; nwritten: number };
type ResolveResult = { errno: number; hostPath: string | null };

/**
 * Never let a Node exception reach the shim: it would unwind through the wasm
 * stack instead of becoming an errno the guest can handle.
 */
function errnoOf(error: unknown): number {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return wasiDefs.ERRNO_NOENT;
    case "EACCES":
      return wasiDefs.ERRNO_ACCES;
    case "EPERM":
      return wasiDefs.ERRNO_PERM;
    case "ENOTDIR":
      return wasiDefs.ERRNO_NOTDIR;
    case "EISDIR":
      return wasiDefs.ERRNO_ISDIR;
    case "EINVAL":
      return wasiDefs.ERRNO_INVAL;
    case "ELOOP":
      return wasiDefs.ERRNO_LOOP;
    case "ENAMETOOLONG":
      return wasiDefs.ERRNO_NAMETOOLONG;
    case "EMFILE":
      return wasiDefs.ERRNO_MFILE;
    case "ENFILE":
      return wasiDefs.ERRNO_NFILE;
    case "EBUSY":
      return wasiDefs.ERRNO_BUSY;
    default:
      return wasiDefs.ERRNO_IO;
  }
}

function toFiletype(stats: fs.BigIntStats): number {
  if (stats.isDirectory()) {
    return wasiDefs.FILETYPE_DIRECTORY;
  }
  if (stats.isSymbolicLink()) {
    return wasiDefs.FILETYPE_SYMBOLIC_LINK;
  }
  if (stats.isFile()) {
    return wasiDefs.FILETYPE_REGULAR_FILE;
  }
  return wasiDefs.FILETYPE_UNKNOWN;
}

function toFilestat(stats: fs.BigIntStats): wasiDefs.Filestat {
  const filestat = new wasiDefs.Filestat(
    stats.ino,
    toFiletype(stats),
    stats.size,
  );
  filestat.dev = stats.dev;
  filestat.nlink = stats.nlink;
  filestat.atim = stats.atimeNs;
  filestat.mtim = stats.mtimeNs;
  filestat.ctim = stats.ctimeNs;
  return filestat;
}

/**
 * The sandbox boundary shared by every directory and file handle of one
 * preopen: it owns the containment rule and the open host descriptors.
 */
class HostFsRoot {
  public readonly root: string;
  private readonly openFiles = new Set<HostFile>();

  public constructor(
    hostRoot: string,
    private readonly maxOpenFiles: number,
  ) {
    const resolved = normalizeRoot(hostRoot);
    // The root itself may be reached through a symlink (/tmp on macOS), and
    // containment compares against real paths, so it has to be one too.
    this.root = realpathOrSelf(resolved);
  }

  /**
   * Containment is decided on the *real* path: a textual check is defeated by
   * a symlink inside the root pointing out of it.
   */
  public resolve(baseDir: string, guestPath: string): ResolveResult {
    const hostPath = fromGuest(this.root, guestPath, baseDir);
    if (hostPath === undefined) {
      return { errno: wasiDefs.ERRNO_NOENT, hostPath: null };
    }
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(hostPath);
    } catch (error) {
      return { errno: errnoOf(error), hostPath: null };
    }
    if (!contains(this.root, realPath)) {
      return { errno: wasiDefs.ERRNO_NOENT, hostPath: null };
    }
    return { errno: wasiDefs.ERRNO_SUCCESS, hostPath };
  }

  public openFile(hostPath: string): OpenResult {
    if (this.openFiles.size >= this.maxOpenFiles) {
      return { ret: wasiDefs.ERRNO_MFILE, fd_obj: null };
    }
    let fd: number;
    try {
      fd = fs.openSync(hostPath, "r");
    } catch (error) {
      return { ret: errnoOf(error), fd_obj: null };
    }
    const file = new HostFile(this, fd);
    this.openFiles.add(file);
    return { ret: wasiDefs.ERRNO_SUCCESS, fd_obj: file };
  }

  public release(file: HostFile): void {
    this.openFiles.delete(file);
  }

  /** Closes descriptors a guest left open when it exited. */
  public dispose(): void {
    for (const file of [...this.openFiles]) {
      file.fd_close();
    }
  }
}

function realpathOrSelf(hostPath: string): string {
  try {
    return fs.realpathSync.native(hostPath);
  } catch {
    return hostPath;
  }
}

class HostFile extends Fd {
  private fd: number | null;
  private position = 0n;

  public constructor(
    private readonly owner: HostFsRoot,
    fd: number,
  ) {
    super();
    this.fd = fd;
  }

  public fd_fdstat_get(): FdstatResult {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_REGULAR_FILE, 0),
    };
  }

  public fd_fdstat_set_flags(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public fd_filestat_get(): FilestatResult {
    if (this.fd === null) {
      return { ret: wasiDefs.ERRNO_BADF, filestat: null };
    }
    try {
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        filestat: toFilestat(fs.fstatSync(this.fd, { bigint: true })),
      };
    } catch (error) {
      return { ret: errnoOf(error), filestat: null };
    }
  }

  public fd_read(size: number): ReadResult {
    const result = this.read(size, this.position);
    this.position += BigInt(result.data.length);
    return result;
  }

  public fd_pread(size: number, offset: bigint): ReadResult {
    return this.read(size, offset);
  }

  public fd_seek(offset: bigint, whence: number): SeekResult {
    if (this.fd === null) {
      return { ret: wasiDefs.ERRNO_BADF, offset: 0n };
    }
    switch (whence) {
      case wasiDefs.WHENCE_SET:
        this.position = offset;
        break;
      case wasiDefs.WHENCE_CUR:
        this.position += offset;
        break;
      case wasiDefs.WHENCE_END:
        try {
          this.position = fs.fstatSync(this.fd, { bigint: true }).size + offset;
        } catch (error) {
          return { ret: errnoOf(error), offset: 0n };
        }
        break;
      default:
        return { ret: wasiDefs.ERRNO_INVAL, offset: 0n };
    }
    return { ret: wasiDefs.ERRNO_SUCCESS, offset: this.position };
  }

  public fd_tell(): SeekResult {
    return { ret: wasiDefs.ERRNO_SUCCESS, offset: this.position };
  }

  public fd_write(_data: Uint8Array): WriteResult {
    return { ret: wasiDefs.ERRNO_ROFS, nwritten: 0 };
  }

  public fd_pwrite(_data: Uint8Array, _offset: bigint): WriteResult {
    return { ret: wasiDefs.ERRNO_ROFS, nwritten: 0 };
  }

  public fd_allocate(_offset: bigint, _len: bigint): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public fd_filestat_set_size(_size: bigint): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public fd_filestat_set_times(
    _atim: bigint,
    _mtim: bigint,
    _fstFlags: number,
  ): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public fd_close(): number {
    const fd = this.fd;
    this.fd = null;
    this.owner.release(this);
    if (fd === null) {
      return wasiDefs.ERRNO_SUCCESS;
    }
    try {
      fs.closeSync(fd);
    } catch (error) {
      return errnoOf(error);
    }
    return wasiDefs.ERRNO_SUCCESS;
  }

  private read(size: number, offset: bigint): ReadResult {
    if (this.fd === null) {
      return { ret: wasiDefs.ERRNO_BADF, data: new Uint8Array() };
    }
    try {
      const buffer = Buffer.allocUnsafe(size);
      const read = fs.readSync(this.fd, buffer, 0, size, Number(offset));
      // A copy, not a view: the pooled buffer behind allocUnsafe is reused
      // while the shim may still hold the returned array.
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        data: new Uint8Array(buffer.subarray(0, read)),
      };
    } catch (error) {
      return { ret: errnoOf(error), data: new Uint8Array() };
    }
  }
}

/**
 * A directory reached through a preopen. It is deliberately not a preopen
 * itself: only real preopens may answer fd_prestat_get, or the guest libc
 * enumerates phantom preopens.
 */
class HostDirectory extends Fd {
  public constructor(
    protected readonly owner: HostFsRoot,
    protected readonly dirPath: string,
  ) {
    super();
  }

  public fd_prestat_get(): { ret: number; prestat: wasiDefs.Prestat | null } {
    return { ret: wasiDefs.ERRNO_BADF, prestat: null };
  }

  public fd_fdstat_get(): FdstatResult {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_DIRECTORY, 0),
    };
  }

  public fd_fdstat_set_flags(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public fd_filestat_get(): FilestatResult {
    try {
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        filestat: toFilestat(fs.statSync(this.dirPath, { bigint: true })),
      };
    } catch (error) {
      return { ret: errnoOf(error), filestat: null };
    }
  }

  public fd_close(): number {
    return wasiDefs.ERRNO_SUCCESS;
  }

  public path_filestat_get(flags: number, path: string): FilestatResult {
    const { errno, hostPath } = this.owner.resolve(this.dirPath, path);
    if (hostPath === null) {
      return { ret: errno, filestat: null };
    }
    try {
      const follow = (flags & LOOKUPFLAGS_SYMLINK_FOLLOW) !== 0;
      const stats = follow
        ? fs.statSync(hostPath, { bigint: true })
        : fs.lstatSync(hostPath, { bigint: true });
      return { ret: wasiDefs.ERRNO_SUCCESS, filestat: toFilestat(stats) };
    } catch (error) {
      return { ret: errnoOf(error), filestat: null };
    }
  }

  public path_readlink(path: string): { ret: number; data: string | null } {
    const { errno, hostPath } = this.owner.resolve(this.dirPath, path);
    if (hostPath === null) {
      return { ret: errno, data: null };
    }
    try {
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        data: fs.readlinkSync(hostPath, "utf8"),
      };
    } catch (error) {
      return { ret: errnoOf(error), data: null };
    }
  }

  public path_open(
    _dirflags: number,
    path: string,
    oflags: number,
    _fsRightsBase: bigint,
    _fsRightsInheriting: bigint,
    _fdFlags: number,
  ): OpenResult {
    const mutating =
      wasiDefs.OFLAGS_CREAT | wasiDefs.OFLAGS_TRUNC | wasiDefs.OFLAGS_EXCL;
    if ((oflags & mutating) !== 0) {
      return { ret: wasiDefs.ERRNO_ROFS, fd_obj: null };
    }
    const { errno, hostPath } = this.owner.resolve(this.dirPath, path);
    if (hostPath === null) {
      return { ret: errno, fd_obj: null };
    }
    let stats: fs.BigIntStats;
    try {
      stats = fs.statSync(hostPath, { bigint: true });
    } catch (error) {
      return { ret: errnoOf(error), fd_obj: null };
    }
    if (stats.isDirectory()) {
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        fd_obj: new HostDirectory(this.owner, hostPath),
      };
    }
    if ((oflags & wasiDefs.OFLAGS_DIRECTORY) !== 0) {
      return { ret: wasiDefs.ERRNO_NOTDIR, fd_obj: null };
    }
    return this.owner.openFile(hostPath);
  }

  public fd_readdir_single(cookie: bigint): ReaddirResult {
    try {
      const entries = fs.readdirSync(this.dirPath, { withFileTypes: true });
      const index = Number(cookie);
      if (index >= entries.length) {
        return { ret: wasiDefs.ERRNO_SUCCESS, dirent: null };
      }
      const entry = entries[index];
      const stats = fs.lstatSync(`${this.dirPath}/${entry.name}`, {
        bigint: true,
      });
      return {
        ret: wasiDefs.ERRNO_SUCCESS,
        dirent: new wasiDefs.Dirent(
          cookie + 1n,
          stats.ino,
          entry.name,
          toFiletype(stats),
        ),
      };
    } catch (error) {
      return { ret: errnoOf(error), dirent: null };
    }
  }

  public path_create_directory(_path: string): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public path_unlink_file(_path: string): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public path_remove_directory(_path: string): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public path_rename(
    _oldPath: string,
    _newFd: number,
    _newPath: string,
  ): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public path_link(_path: string): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public path_unlink(_path: string): { ret: number; inode_obj: null } {
    return { ret: wasiDefs.ERRNO_ROFS, inode_obj: null };
  }

  public path_filestat_set_times(
    _flags: number,
    _path: string,
    _atim: bigint,
    _mtim: bigint,
    _fstFlags: number,
  ): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public fd_write(_data: Uint8Array): WriteResult {
    return { ret: wasiDefs.ERRNO_ROFS, nwritten: 0 };
  }

  public fd_allocate(_offset: bigint, _len: bigint): number {
    return wasiDefs.ERRNO_ROFS;
  }

  public fd_filestat_set_size(_size: bigint): number {
    return wasiDefs.ERRNO_ROFS;
  }
}

export interface HostPreopenOptions {
  readonly maxOpenFiles?: number;
}

/** A read-only preopen directory serving one host directory tree. */
export class HostPreopenDirectory extends HostDirectory {
  private readonly guestName: string;

  public constructor(
    guestName: string,
    hostRoot: string,
    options: HostPreopenOptions = {},
  ) {
    const owner = new HostFsRoot(
      hostRoot,
      options.maxOpenFiles ?? DEFAULT_MAX_OPEN_FILES,
    );
    super(owner, owner.root);
    this.guestName = guestName;
  }

  /** The host directory the guest sees, with symlinks resolved. */
  public get hostRoot(): string {
    return this.owner.root;
  }

  public fd_prestat_get(): { ret: number; prestat: wasiDefs.Prestat | null } {
    return {
      ret: wasiDefs.ERRNO_SUCCESS,
      prestat: wasiDefs.Prestat.dir(this.guestName),
    };
  }

  /** Releases every host descriptor still open under this preopen. */
  public dispose(): void {
    this.owner.dispose();
  }
}
