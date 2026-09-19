import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prettyDiagnosticMessage } from "../../src/pretty-diagnostic.js";

interface GoldenMessage {
  code: string;
  message: string;
  pretty: string;
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

test("keeps prose outside shell syntax spans", () => {
  assert.strictEqual(
    prettyDiagnosticMessage("Couldn't find 'fi' for this 'if'."),
    "Couldn't `find 'fi'` for this `'if'`\\.",
  );
  assert.strictEqual(
    prettyDiagnosticMessage(
      "This apostrophe terminated the single quoted string!",
    ),
    "This apostrophe terminated the single quoted string\\!",
  );
  assert.strictEqual(
    prettyDiagnosticMessage('Use array+=("item") to append items to an array.'),
    'Use `array+=("item")` to append items to an array\\.',
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
  const golden = loadGoldenMessages();

  assert.strictEqual(golden.length, 417);
  for (const { code, message, pretty } of golden) {
    assert.strictEqual(prettyDiagnosticMessage(message), pretty, code);
  }
});
