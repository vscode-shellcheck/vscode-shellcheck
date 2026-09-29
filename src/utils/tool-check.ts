import { SemVer, parse as semVerParse } from "semver";

export function parseToolVersion(s: string): SemVer {
  const match = s.match(/version: v?((?:\d+)\.(?:\d+)(?:\.\d+)*)/);
  if (!match || match.length < 2) {
    throw new Error(`Unexpected response from ShellCheck: ${s}`);
  }
  const version: SemVer | null = semVerParse(match[1]);
  if (!version) {
    throw new Error(`Unable to parse ShellCheck version: ${match[1]}`);
  }
  return version;
}
