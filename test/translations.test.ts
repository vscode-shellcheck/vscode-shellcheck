import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

type Catalog = Record<string, string | { message: string }>;

/** The VS Code locale ID of each display language, sorted. */
const LOCALES = ["de", "es", "fr", "ja", "zh-cn"];

const root = vscode.extensions.getExtension(
  "timonwong.shellcheck",
)!.extensionPath;

/** Each English catalog, and the file names of its translations. */
const catalogs = [
  { source: "package.nls.json", pattern: /^package\.nls\.(.+)\.json$/ },
  {
    source: "l10n/bundle.l10n.json",
    pattern: /^bundle\.l10n\.(.+)\.json$/,
  },
];

// Placeholders, codicons, code spans, setting links, and link targets: what a
// translation has to carry over unchanged for the string to keep working.
const verbatim = /\{\d+\}|\$\([\w~-]+\)|`[^`]*`|#[\w.]+#|\]\([^)]*\)/g;

function read(file: string): Catalog {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Catalog;
}

function message(value: Catalog[string]): string {
  return typeof value === "string" ? value : value.message;
}

function verbatimParts(text: string): string[] {
  return (text.match(verbatim) ?? []).sort();
}

function translatedLocales(source: string, pattern: RegExp): string[] {
  return fs
    .readdirSync(path.join(root, path.dirname(source)))
    .map((file) => pattern.exec(file)?.[1])
    .filter((locale): locale is string => locale !== undefined)
    .sort();
}

suite("Translations", () => {
  for (const { source, pattern } of catalogs) {
    test(`${source}: every language has a translation`, () => {
      assert.deepStrictEqual(translatedLocales(source, pattern), LOCALES);
    });

    test(`${source}: translations hold only English keys`, () => {
      const english = read(source);
      for (const locale of LOCALES) {
        const file = source.replace(/\.json$/, `.${locale}.json`);
        const stale = Object.keys(read(file)).filter(
          (key) => !Object.hasOwn(english, key),
        );
        assert.deepStrictEqual(stale, [], file);
      }
    });

    test(`${source}: translations keep placeholders, code, and links`, () => {
      const english = read(source);
      for (const locale of LOCALES) {
        const file = source.replace(/\.json$/, `.${locale}.json`);
        for (const [key, value] of Object.entries(read(file))) {
          if (!Object.hasOwn(english, key)) continue;
          assert.deepStrictEqual(
            verbatimParts(message(value)),
            verbatimParts(message(english[key])),
            `${file}: ${key}`,
          );
        }
      }
    });
  }
});
