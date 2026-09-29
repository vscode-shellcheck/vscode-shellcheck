import * as vscode from "vscode";

/** The directory mounted at guest `/`, and the guest `PWD` inside it. */
export interface MountPlan {
  readonly root: vscode.Uri;
  readonly pwd: string;
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Guest path of `target` in a mount at `root`, or undefined when it lies
 * outside. Works on `Uri.path`, which is POSIX for every scheme, so no host
 * path rules are involved.
 */
export function toGuestPath(
  root: vscode.Uri,
  target: vscode.Uri,
): string | undefined {
  if (root.scheme !== target.scheme || root.authority !== target.authority) {
    return undefined;
  }
  const rootPath = trimTrailingSlash(root.path);
  const targetPath = trimTrailingSlash(target.path);
  if (targetPath === rootPath) {
    return "/";
  }
  const prefix = rootPath === "/" ? "/" : `${rootPath}/`;
  // VS Code matches workspace folders case-insensitively where the file
  // system is, and reports drive letters in either case, so the folder that
  // owns a document may differ from its path in case alone.
  if (
    targetPath.startsWith(prefix) ||
    targetPath.toLowerCase().startsWith(prefix.toLowerCase())
  ) {
    return `/${targetPath.slice(prefix.length)}`;
  }
  return undefined;
}

/**
 * The Uri a guest path names in a mount at `root`, or undefined for one that
 * climbs out of it. The package normalizes guest paths before they get here;
 * this only keeps `Uri.joinPath`, which resolves `..`, from being the place
 * that relies on it.
 */
export function fromGuestPath(
  root: vscode.Uri,
  guestPath: string,
): vscode.Uri | undefined {
  const segments = guestPath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    return undefined;
  }
  return segments.length ? vscode.Uri.joinPath(root, ...segments) : root;
}

/**
 * What a document gets to see: its workspace folder when it has one, else its
 * own directory. `PWD` is the document's directory, as the native runtime's
 * working directory is, or the folder root under `useWorkspaceRootAsCwd`.
 * Untitled documents have no directory and get no files at all.
 */
export function planDocumentMount(
  document: vscode.Uri,
  workspaceFolder: vscode.Uri | undefined,
  useWorkspaceRootAsCwd: boolean,
): MountPlan | undefined {
  if (document.scheme === "untitled") {
    return undefined;
  }
  const directory = vscode.Uri.joinPath(document, "..");
  if (workspaceFolder) {
    const pwd = useWorkspaceRootAsCwd
      ? "/"
      : toGuestPath(workspaceFolder, directory);
    if (pwd !== undefined) {
      return { root: workspaceFolder, pwd };
    }
  }
  // Also the fallback for a folder that does not contain the directory after
  // all: a PWD outside the mount makes the guest RTS chdir fail and stdout
  // come back silently empty.
  return { root: directory, pwd: "/" };
}

/**
 * `--flag=/abs/path` and a bare `/abs/path` alike, in POSIX or Windows form,
 * whatever the platform: the guest sees neither under that name.
 */
export function hasHostAbsolutePath(arg: string): boolean {
  const separator = arg.indexOf("=");
  const value = separator === -1 ? arg : arg.slice(separator + 1);
  return /^(\/|\\\\|[A-Za-z]:[\\/])/.test(value);
}
