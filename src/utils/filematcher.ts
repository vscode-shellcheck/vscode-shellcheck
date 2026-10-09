// Originally stolen from vscode-jshint:
// https://github.com/Microsoft/vscode-jshint/blob/ab784c08de7bbc6bac5b5c3fe1c1fbaa3fea110f/jshint-server/src/server.ts#L258
import picomatch from "picomatch";
import { keys, pickBy } from "remeda";

export interface FileSettings {
  readonly [pattern: string]: boolean;
}

// picomatch treats `\` as an escape unless `windows` is on, so paths from
// `fsPath` have to be compared in POSIX form.
function toPosixPath(fsPath: string): string {
  return fsPath.replace(/\\/g, "/");
}

const MATCH_OPTIONS = { dot: true, windows: false } as const;

export class FileMatcher {
  private isExcluded: picomatch.Matcher;
  private excludeCache: Record<string, boolean>;

  constructor() {
    this.isExcluded = picomatch([], MATCH_OPTIONS);
    this.excludeCache = {};
  }

  private pickTrueKeys(obj: FileSettings): string[] {
    return keys(
      pickBy(obj, (value) => {
        return value === true;
      }),
    );
  }

  public configure(exclude: FileSettings): void {
    this.excludeCache = {};
    this.isExcluded = picomatch(this.pickTrueKeys(exclude), MATCH_OPTIONS);
  }

  private relativeTo(fsPath: string, folder?: string): string {
    if (folder && fsPath.indexOf(folder) === 0) {
      let cuttingPoint = folder.length;
      if (cuttingPoint < fsPath.length && fsPath.charAt(cuttingPoint) === "/") {
        cuttingPoint += 1;
      }
      return fsPath.substring(cuttingPoint);
    }
    return fsPath;
  }

  public excludes(fsPath: string, root?: string): boolean {
    if (!fsPath) {
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(this.excludeCache, fsPath)) {
      return this.excludeCache[fsPath];
    }
    const shouldBeExcluded = this.isExcluded(
      this.relativeTo(
        toPosixPath(fsPath),
        root ? toPosixPath(root) : undefined,
      ),
    );
    this.excludeCache[fsPath] = shouldBeExcluded;
    return shouldBeExcluded;
  }
}
