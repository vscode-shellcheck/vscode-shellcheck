// Stolen from vscode-jshint.
import * as _ from 'lodash';
import * as minimatch from 'minimatch';


export interface FileSettings {
    [pattern: string]: boolean;
}

export class FileMatcher {

    private excludePatterns: string[];
    private excludeCache: { [key: string]: any };

    constructor() {
        this.excludePatterns = null;
        this.excludeCache = {};
    }

    private pickTrueKeys(obj: FileSettings): string[] {
        return _.keys(_.pickBy(obj, (value) => {
            return value === true;
        }));
    }

    public configure(exclude?: FileSettings): void {
        this.excludeCache = {};
        this.excludePatterns = this.pickTrueKeys(exclude);
    }

    public clear(exclude?: FileSettings): void {
        this.excludeCache = {};
    }

    private relativeTo(fsPath: string, folder: string): string {
        if (folder && fsPath.indexOf(folder) === 0) {
            let cuttingPoint = folder.length;
            if (cuttingPoint < fsPath.length && fsPath.charAt(cuttingPoint) === '/') {
                cuttingPoint += 1;
            }
            return fsPath.substr(cuttingPoint);
        }
        return fsPath;
    }

    private folderOf(fsPath: string): string {
        const index = fsPath.lastIndexOf('/');
        return index > -1 ? fsPath.substr(0, index) : fsPath;
    }

    private match(excludePatterns: string[], path: string, root: string): boolean {
        const relativePath = this.relativeTo(path, root);
        return _.some(excludePatterns, (pattern) => {
            return minimatch(relativePath, pattern, { dot: true });
        });
    }

    public excludes(fsPath: string, root: string): boolean {
        if (fsPath) {
            if (this.excludeCache.hasOwnProperty(fsPath)) {
                return this.excludeCache[fsPath];
            }

            const shouldBeExcluded = this.match(this.excludePatterns, fsPath, root);
            this.excludeCache[fsPath] = shouldBeExcluded;
            return shouldBeExcluded;
        }

        return true;
    }
}
