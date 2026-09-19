import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prettyDiagnosticMessage } from "../../src/pretty-diagnostic.js";

interface ShellCheckMessage {
  code: string;
  link: string;
  message: string;
}

interface GoldenMessage extends ShellCheckMessage {
  pretty: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function loadShellCheckMessages(): ShellCheckMessage[] {
  const csv = readFileSync(
    new URL("../../../test/fixtures/shellcheck-messages.csv", import.meta.url),
    "utf8",
  );
  const rows = parseCsv(csv);
  assert.deepStrictEqual(rows.shift(), ["name", "link", "description"]);
  return rows.map(([code, link, message]) => ({ code, link, message }));
}

function loadGoldenMessages(): GoldenMessage[] {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../test/fixtures/shellcheck-messages.golden.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as GoldenMessage[];
}

test("formats ShellCheck's quoted and shell syntax examples", () => {
  assert.strictEqual(
    prettyDiagnosticMessage(
      "Don't use variables in the printf format string. Use printf '..%s..' \"$foo\".",
    ),
    "Don't use variables in the \x60printf\x60 format string\\. Use \x60printf '..%s..' \"$foo\"\x60\\.",
  );
  assert.strictEqual(
    prettyDiagnosticMessage(
      'Use [ "$var" = value ] and $((i/2+7)); redirect with 2>&1 or grep|wc -l.',
    ),
    'Use \x60[ "$var" = value ]\x60 and \x60$((i/2+7))\x60; redirect with \x602>&1\x60 or \x60grep|wc -l\x60\\.',
  );
});

test("keeps natural apostrophes and unsafe Markdown as text", () => {
  assert.strictEqual(
    prettyDiagnosticMessage(
      "Don't use [this](https://example.test) or <tag>; can't parse it.",
    ),
    "Don't use \\[this\\]\\(https://example\\.test\\) or \\<tag\\>; can't parse it\\.",
  );
});

test("preserves line breaks and falls back safely for incomplete markup", () => {
  assert.strictEqual(
    prettyDiagnosticMessage("First line\r\nSecond line"),
    "First line  \nSecond line",
  );
  assert.strictEqual(
    prettyDiagnosticMessage(
      "Use \x60\x60a \x60 b\x60\x60 or an unclosed \x60snippet",
    ),
    "Use \x60\x60a \x60 b\x60\x60 or an unclosed \\\x60snippet",
  );
});

test("matches the ShellCheck diagnostic golden corpus", () => {
  const messages = loadShellCheckMessages();
  const golden = loadGoldenMessages();

  assert.strictEqual(messages.length, 417);
  assert.deepStrictEqual(
    messages.map(({ code, link, message }) => ({ code, link, message })),
    golden.map(({ code, link, message }) => ({ code, link, message })),
  );
  for (const { code, message, pretty } of golden) {
    assert.strictEqual(prettyDiagnosticMessage(message), pretty, code);
  }
});
