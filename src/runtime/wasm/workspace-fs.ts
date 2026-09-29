import type {
  FileSystemErrorCode,
  FileType,
  ShellCheckFileSystem,
} from "@vscode-shellcheck/shellcheck-wasm";
import * as vscode from "vscode";
import { LintMount } from "../types.js";
import { fromGuestPath, planDocumentMount } from "./guest-path.js";

/** The subset of `vscode.FileSystem` ShellCheck reads through. */
export type ReadableFileSystem = Pick<
  vscode.FileSystem,
  "stat" | "readFile" | "readDirectory"
>;

const FAILURE_CODES: ReadonlySet<string> = new Set<FileSystemErrorCode>([
  "FileNotFound",
  "FileNotADirectory",
  "FileIsADirectory",
  "NoPermissions",
  "Unavailable",
]);

function fileTypeOf(type: vscode.FileType): FileType {
  // A link reports its target's type with this bit added; where the link
  // leads is the provider's business, not ours.
  switch (type & ~vscode.FileType.SymbolicLink) {
    case vscode.FileType.File:
      return "file";
    case vscode.FileType.Directory:
      return "directory";
    default:
      return "other";
  }
}

/** Keeps only the codes the package can report to the guest. */
function translateError(error: unknown): unknown {
  if (
    error instanceof vscode.FileSystemError &&
    FAILURE_CODES.has(error.code)
  ) {
    return Object.assign(new Error(error.message), { code: error.code });
  }
  return error;
}

async function translated<T>(operation: () => Thenable<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw translateError(error);
  }
}

function notFound(path: string): Error {
  const code: FileSystemErrorCode = "FileNotFound";
  return Object.assign(new Error(`${path} is outside the mount`), { code });
}

/**
 * Serves the guest's reads from `root` through `vscode.workspace.fs`, whatever
 * the scheme. Symlinks are followed wherever the provider follows them.
 */
export function createWorkspaceFileSystem(
  root: vscode.Uri,
  fs: ReadableFileSystem = vscode.workspace.fs,
): ShellCheckFileSystem {
  const resolve = (path: string): vscode.Uri => {
    const uri = fromGuestPath(root, path);
    if (!uri) {
      throw notFound(path);
    }
    return uri;
  };
  return {
    stat: (path) =>
      translated(async () => {
        const { type, size, mtime } = await fs.stat(resolve(path));
        return { type: fileTypeOf(type), size, mtime };
      }),
    readFile: (path) => translated(() => fs.readFile(resolve(path))),
    readDirectory: (path) =>
      translated(async () => {
        const entries = await fs.readDirectory(resolve(path));
        return entries.map(([name, type]) => [name, fileTypeOf(type)] as const);
      }),
  };
}

async function isDirectory(
  uri: vscode.Uri,
  fs: ReadableFileSystem,
): Promise<boolean> {
  try {
    return fileTypeOf((await fs.stat(uri)).type) === "directory";
  } catch {
    return false;
  }
}

/**
 * The files a document is linted against, or undefined for stdin only. The
 * working directory is checked first, as the native runtime checks its own:
 * a scheme nobody serves, or a document whose directory is gone, would
 * otherwise fail the guest's chdir instead of just going without files.
 */
export async function resolveDocumentMount(
  document: vscode.Uri,
  useWorkspaceRootAsCwd: boolean,
  fs: ReadableFileSystem = vscode.workspace.fs,
): Promise<LintMount | undefined> {
  const plan = planDocumentMount(
    document,
    vscode.workspace.getWorkspaceFolder(document)?.uri,
    useWorkspaceRootAsCwd,
  );
  const workingDirectory = plan && fromGuestPath(plan.root, plan.pwd);
  if (
    !plan ||
    !workingDirectory ||
    !(await isDirectory(workingDirectory, fs))
  ) {
    return undefined;
  }
  return { fs: createWorkspaceFileSystem(plan.root, fs), pwd: plan.pwd };
}
