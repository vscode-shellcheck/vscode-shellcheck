import path from "node:path";

/** Raised when a host path cannot be named inside the preopen tree. */
export class OutsidePreopenError extends Error {
  public constructor(root: string, hostPath: string) {
    super(`"${hostPath}" is outside the preopen root "${root}"`);
    this.name = "OutsidePreopenError";
  }
}

/** A preopen root and the guest working directory to run inside it. */
export interface PreopenMapping {
  /** Host directory the guest sees as `/`. */
  readonly hostRoot: string;
  /** Guest path handed to the guest as `PWD`. Always inside `hostRoot`. */
  readonly pwd: string;
}

export interface GuestPathMapper {
  normalizeRoot(root: string): string;
  contains(root: string, hostPath: string): boolean;
  toGuest(root: string, hostPath: string): string;
  resolveMapping(
    preopenRoot: string | undefined,
    cwd: string | undefined,
  ): PreopenMapping | undefined;
}

/**
 * The `windows` flag is separate from `impl` so the win32 rules can be
 * exercised from a test running on any platform.
 */
export function createGuestPathMapper(
  impl: path.PlatformPath,
  windows: boolean,
): GuestPathMapper {
  function normalizeRoot(root: string): string {
    const resolved = impl.resolve(root);
    // Containment is a textual comparison, so both sides must agree on the
    // drive letter casing VS Code reports inconsistently (see
    // fixDriveCasingInWindows in src/utils/path.ts).
    return windows && resolved.length > 0
      ? resolved[0].toUpperCase() + resolved.slice(1)
      : resolved;
  }

  function contains(root: string, hostPath: string): boolean {
    return hostPath === root || hostPath.startsWith(root + impl.sep);
  }

  function toGuest(root: string, hostPath: string): string {
    const relative = impl.relative(root, hostPath);
    if (relative === "") {
      return "/";
    }
    if (
      relative === ".." ||
      relative.startsWith(`..${impl.sep}`) ||
      impl.isAbsolute(relative)
    ) {
      throw new OutsidePreopenError(root, hostPath);
    }
    return "/" + relative.split(impl.sep).join("/");
  }

  function resolveMapping(
    preopenRoot: string | undefined,
    cwd: string | undefined,
  ): PreopenMapping | undefined {
    if (preopenRoot === undefined || cwd === undefined) {
      return undefined;
    }
    const root = normalizeRoot(preopenRoot);
    const workingDirectory = normalizeRoot(cwd);
    // A PWD outside the preopen makes the guest RTS chdir fail and stdout come
    // back silently empty, so re-root the preopen rather than emit one. This
    // happens in multi-root windows, where the workspace folder of a document
    // belonging to no folder is the first folder, not the document's own.
    const hostRoot = contains(root, workingDirectory) ? root : workingDirectory;
    return { hostRoot, pwd: toGuest(hostRoot, workingDirectory) };
  }

  return { normalizeRoot, contains, toGuest, resolveMapping };
}

const platformMapper = createGuestPathMapper(
  path,
  process.platform === "win32",
);

export const resolveMapping = platformMapper.resolveMapping;
