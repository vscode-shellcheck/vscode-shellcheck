// ShellCheck messages quote shell parameter expansions, so plain strings in
// this file legitimately contain ${...}.
/* eslint-disable no-template-curly-in-string */
import assert from "node:assert";
import {
  escapeMarkdownText,
  prettyDiagnosticMessage,
} from "../src/pretty-diagnostic.js";

interface FormatterCase {
  code: string;
  message: string;
  spans: string[];
  // Expected round trip, when it differs from the message because the message
  // used backticks as its own delimiters.
  text?: string;
}

// Messages are real ShellCheck 0.11.0 output unless marked as synthetic. The
// expected spans are derived from the detection rules, not from the formatter.
const cases: FormatterCase[] = [
  {
    code: "SC1003",
    message: "Want to escape a single quote? echo 'This is how it'\\''s done'.",
    spans: ["'This is how it'", "''"],
  },
  {
    code: "SC1007",
    message:
      "Remove space after = if trying to assign a value (for empty string, use var='' ... ).",
    spans: ["=", "var=''"],
  },
  {
    code: "SC1010",
    message:
      "Use semicolon or linefeed before 'done' (or quote to make it literal).",
    spans: ["'done'"],
  },
  {
    code: "SC1036",
    message: "'(' is invalid here. Did you forget to escape it?",
    spans: ["'('"],
  },
  {
    code: "SC1038",
    message: "Shells are space sensitive. Use '< <(cmd)', not '<<(cmd)'.",
    spans: ["'< <(cmd)'", "'<<(cmd)'"],
  },
  {
    code: "SC1044",
    message: "Couldn't find end token \x60EOF' in the here document.",
    spans: [],
  },
  {
    code: "SC1046",
    message: "Couldn't find 'fi' for this 'if'.",
    spans: ["'fi'", "'if'"],
  },
  {
    code: "SC1069",
    message: "You need a space before the [.",
    spans: [],
  },
  {
    code: "SC1072",
    message: " Fix any mentioned problems and try again.",
    spans: [],
  },
  {
    code: "SC1073",
    message: "Couldn't parse this if expression. Fix to allow more checks.",
    spans: [],
  },
  {
    code: "SC1083",
    message:
      "This { is literal. Check expression (missing ;/\\n?) or quote it.",
    spans: [],
  },
  {
    code: "SC1087",
    message:
      "Use braces when expanding arrays, e.g. ${array[idx]} (or ${var}[.. to quiet).",
    spans: ["${array[idx]}", "${var}"],
  },
  {
    code: "SC1090",
    message:
      "ShellCheck can't follow non-constant source. Use a directive to specify location.",
    spans: [],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./$(sync~spin)/lib.sh was not specified as input (see shellcheck -x).",
    spans: ["$(sync~spin)", "-x"],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./${x}/y.sh was not specified as input (see shellcheck -x).",
    spans: ["${x}", "-x"],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./&lt;&amp;.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./[click](http://evil.example)/z.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./we\\\x60ird\\\x60.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091",
    message:
      "Not following: ./x<a href=javascript:alert(1)>y.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091 (synthetic path)",
    message:
      "Not following: ./use for=.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091 (synthetic path)",
    message:
      "Not following: ./http://evil.example/x.sh was not specified as input (see shellcheck -x).",
    spans: ["-x"],
  },
  {
    code: "SC1091 (synthetic path with a line break)",
    message:
      "Not following: ./'a\n> b'.sh was not specified as input (see shellcheck -x).",
    spans: [">", "-x"],
  },
  {
    code: "SC1142",
    message:
      "Use 'done < <(cmd)' to redirect from process substitution (currently missing one '<').",
    spans: ["'done < <(cmd)'", "'<'"],
  },
  {
    code: "SC1141",
    message:
      "Unexpected tokens after compound command. Bad redirection or missing ;/&&/||/|?",
    spans: [],
  },
  {
    code: "SC2001",
    message: "See if you can use ${variable//search/replace} instead.",
    spans: ["${variable//search/replace}"],
  },
  {
    code: "SC2004",
    message: "$/${} is unnecessary on arithmetic variables.",
    spans: ["${}"],
  },
  {
    code: "SC2005",
    message: "Useless echo? Instead of 'echo $(cmd)', just use 'cmd'.",
    spans: ["'echo $(cmd)'", "'cmd'"],
  },
  {
    code: "SC2006",
    message: "Use $(...) notation instead of legacy backticks \x60...\x60.",
    spans: ["$(...)", "..."],
    text: "Use $(...) notation instead of legacy backticks ....",
  },
  {
    code: "SC2007",
    message: "Use $((..)) instead of deprecated $[..]",
    spans: ["$((..))"],
  },
  {
    code: "SC2010",
    message:
      "Don't use ls | grep. Use a glob or a for loop with a condition to allow non-alphanumeric filenames.",
    spans: ["|"],
  },
  {
    code: "SC2015",
    message:
      "Note that A && B || C is not if-then-else. C may run when A is true.",
    spans: ["&&", "||"],
  },
  {
    code: "SC2024",
    message: "sudo doesn't affect redirects. Use ..| sudo tee file",
    spans: [],
  },
  {
    code: "SC2034",
    message:
      "printf appears unused. Verify use (or export if used externally).",
    spans: [],
  },
  {
    code: "SC2035",
    message:
      "Use ./*glob* or -- *glob* so names with dashes won't become options.",
    spans: [],
  },
  {
    code: "SC2050",
    message: "This expression is constant. Did you forget the $ on a variable?",
    spans: [],
  },
  {
    code: "SC2053",
    message:
      "Quote the right-hand side of = in [[ ]] to prevent glob matching.",
    spans: ["=", "[[ ]]"],
  },
  {
    code: "SC2059",
    message:
      "Don't use variables in the printf format string. Use printf '..%s..' \"$foo\".",
    spans: ["'..%s..' \"$foo\""],
  },
  {
    code: "SC2069",
    message:
      "To redirect stdout+stderr, 2>&1 must be last (or use '{ cmd > file; } 2>&1' to clarify).",
    spans: ["2>&1", "'{ cmd > file; } 2>&1'"],
  },
  {
    code: "SC2071",
    message: "> is for string comparisons. Use -gt instead.",
    spans: [">", "-gt"],
  },
  {
    code: "SC2071",
    message: ">= is not a valid operator. Use -ge .",
    spans: [">=", "-ge"],
  },
  {
    code: "SC2079",
    message: "(( )) doesn't support decimals. Use bc or awk.",
    spans: ["(( ))"],
  },
  {
    code: "SC2084",
    message: "Remove '$' or use '_=$((expr))' to avoid executing output.",
    spans: ["'$'", "'_=$((expr))'"],
  },
  {
    code: "SC2088",
    message: "Tilde does not expand in quotes. Use $HOME.",
    spans: ["$HOME"],
  },
  {
    code: "SC2091",
    message:
      "Remove surrounding $() to avoid executing output (or use eval if intentional).",
    spans: ["$()"],
  },
  {
    code: "SC2115",
    message: 'Use "${var:?}" to ensure this never expands to /* .',
    spans: ['"${var:?}"'],
  },
  {
    code: "SC2118",
    message: "Ksh does not support |&. Use 2>&1 |.",
    spans: ["|&", "2>&1 |"],
  },
  {
    code: "SC2119",
    message: "Use foo \"$@\" if function's $1 should mean script's $1.",
    spans: ['"$@"', "$1", "$1"],
  },
  {
    code: "SC2126",
    message: "Consider using 'grep -c' instead of 'grep|wc -l'.",
    spans: ["'grep -c'", "'grep|wc -l'"],
  },
  {
    code: "SC2129",
    message:
      "Consider using { cmd1; cmd2; } >> file instead of individual redirects.",
    spans: [">>"],
  },
  {
    code: "SC2140",
    message:
      'Word is of the form "A"B"C" (B indicated). Did you mean "ABC" or "A\\"B\\"C"?',
    spans: ['"A"', '"C"', '"ABC"', '"A\\"B\\"C"'],
  },
  {
    code: "SC2145",
    message: "Argument mixes string and array. Use * or separate argument.",
    spans: [],
  },
  {
    code: "SC2154",
    message:
      'command is referenced but not assigned (for output from commands, use "$(command ...)" ).',
    spans: ['"$(command ...)"'],
  },
  {
    code: "SC2161",
    message: "Instead of '[ 1 ]', use 'true'.",
    spans: ["'[ 1 ]'", "'true'"],
  },
  {
    code: "SC2164",
    message: "Use 'cd ... || exit' or 'cd ... || return' in case cd fails.",
    spans: ["'cd ... || exit'", "'cd ... || return'"],
  },
  {
    code: "SC2166",
    message: "Prefer [ p ] && [ q ] as [ p -a q ] is not well defined.",
    spans: ["[ p ] && [ q ]", "[ p -a q ]"],
  },
  {
    code: "SC2179",
    message: 'Use array+=("item") to append items to an array.',
    spans: ['array+=("item")'],
  },
  {
    code: "SC2181",
    message:
      "Check exit code directly with e.g. 'if mycmd;', not indirectly with $?.",
    spans: ["'if mycmd;'", "$?"],
  },
  {
    code: "SC2185",
    message: "Some finds don't have a default path. Specify '.' explicitly.",
    spans: ["'.'"],
  },
  {
    code: "SC2190",
    message:
      "Elements in associative arrays need index, e.g. array=( [index]=value ) .",
    spans: ["array=( [index]=value )"],
  },
  {
    code: "SC2191",
    message:
      "The = here is literal. To assign by index, use ( [index]=value ) with no spaces. To keep as literal, quote it.",
    spans: ["="],
  },
  {
    code: "SC2196",
    message: "egrep is non-standard and deprecated. Use grep -E instead.",
    spans: ["-E"],
  },
  {
    code: "SC2209",
    message: "Use var=$(command) to assign output (or quote to assign string).",
    spans: ["var=$(command)"],
  },
  {
    code: "SC2213",
    message: "getopts specified -&, but it's not handled by this 'case'.",
    spans: ["'case'"],
  },
  {
    code: "SC2213",
    message: "getopts specified -x, but it's not handled by this 'case'.",
    spans: ["-x", "'case'"],
  },
  {
    code: "SC2219",
    message: "Instead of 'let expr', prefer (( expr )) .",
    spans: ["'let expr'", "(( expr ))"],
  },
  {
    code: "SC2267",
    message: "GNU xargs -i is deprecated in favor of -I{}",
    spans: ["-i", "-I"],
  },
  {
    code: "SC2283",
    message:
      "Remove spaces around = to assign (or use [ ] to compare, or quote '=' if literal).",
    spans: ["=", "[ ]", "'='"],
  },
  {
    code: "SC2284",
    message: "Use [ x = y ] to compare values (or quote '==' if literal).",
    spans: ["[ x = y ]", "'=='"],
  },
  {
    code: "SC2285",
    message: "Remove spaces around += to assign (or quote '+=' if literal).",
    spans: ["+=", "'+='"],
  },
  {
    code: "SC2288",
    message:
      "This is interpreted as a command name ending with '>'. Double check syntax.",
    spans: ["'>'"],
  },
  {
    code: "SC2324",
    message:
      "var+=1 will append, not increment. Use (( var += 1 )), typeset -i var, or quote number to silence.",
    spans: ["(( var += 1 ))", "-i"],
  },
  {
    code: "SC3003",
    message: "In POSIX sh, $'..' is undefined.",
    spans: ["$'..'"],
  },
  {
    code: "SC3029",
    message: "In POSIX sh, |& in place of 2>&1 | is undefined.",
    spans: ["|&", "2>&1 |"],
  },
  {
    code: "synthetic",
    message: 'Use [ "$var" = value ] and $((i/2+7)); redirect with 2>&1.',
    spans: ['[ "$var" = value ]', "$((i/2+7))", "2>&1"],
  },
  {
    code: "synthetic",
    message: "Invalid key=value pair in directive",
    spans: [],
  },
  {
    code: "synthetic",
    message: "Use #!, not !#, for the shebang.",
    spans: [],
  },
];

function scanCodeSpan(
  markdown: string,
  index: number,
): { value: string; end: number } {
  let runLength = 1;
  while (markdown[index + runLength] === "\x60") {
    runLength++;
  }

  const fence = "\x60".repeat(runLength);
  const end = markdown.indexOf(fence, index + runLength);
  assert.ok(end >= 0, `unterminated code span in ${JSON.stringify(markdown)}`);
  assert.notStrictEqual(
    markdown[end + runLength],
    "\x60",
    `ragged code fence in ${JSON.stringify(markdown)}`,
  );

  // Undo the padding the way a CommonMark renderer does.
  const value = markdown.slice(index + runLength, end);
  const padded =
    value.startsWith(" ") && value.endsWith(" ") && /[^ ]/.test(value);
  return {
    value: padded ? value.slice(1, -1) : value,
    end: end + runLength,
  };
}

function codeSpans(markdown: string): string[] {
  const spans: string[] = [];
  for (let index = 0; index < markdown.length; index++) {
    if (markdown[index] === "\\") {
      index++;
      continue;
    }
    if (markdown[index] !== "\x60") {
      continue;
    }
    const span = scanCodeSpan(markdown, index);
    spans.push(span.value);
    index = span.end - 1;
  }
  return spans;
}

function toPlainText(markdown: string): string {
  let text = "";
  let index = 0;
  while (index < markdown.length) {
    const character = markdown[index];
    if (character === "\x60") {
      const span = scanCodeSpan(markdown, index);
      text += span.value;
      index = span.end;
    } else if (character === "\\") {
      text += markdown[index + 1];
      index += 2;
    } else if (markdown.startsWith("&nbsp;", index)) {
      text += " ";
      index += 6;
    } else if (markdown.startsWith("  \n", index)) {
      text += "\n";
      index += 3;
    } else {
      text += character;
      index += 1;
    }
  }
  return text;
}

suite("Pretty diagnostic messages", () => {
  for (const { code, message, spans, text } of cases) {
    test(`${code}: ${JSON.stringify(message)}`, () => {
      const markdown = prettyDiagnosticMessage(message);

      assert.deepStrictEqual(codeSpans(markdown), spans);
      assert.strictEqual(toPlainText(markdown), text ?? message);
      for (const line of markdown.split("\n")) {
        assert.ok(
          !/^[ \t]*(?:[>#|=]|[-+*] |\d+[.)] )/.test(line),
          `line starts a Markdown block: ${JSON.stringify(line)}`,
        );
      }
    });
  }

  test("escapes links, raw HTML and entities", () => {
    assert.strictEqual(
      prettyDiagnosticMessage(
        "Don't use [this](https://example.test) or <tag>; can't parse it.",
      ),
      "Don\\'t use \\[this\\]\\(https\\:\\/\\/example\\.test\\) or \\<tag\\>\\; can\\'t parse it\\.",
    );
    assert.strictEqual(escapeMarkdownText("&lt;"), "\\&lt\\;");
  });

  test("keeps leading whitespace visible", () => {
    assert.strictEqual(prettyDiagnosticMessage("\tIndented"), "&nbsp;Indented");
    assert.strictEqual(
      escapeMarkdownText("    four"),
      "&nbsp;".repeat(4) + "four",
    );
  });

  test("turns line endings into hard breaks", () => {
    assert.strictEqual(
      prettyDiagnosticMessage("First line\r\nSecond line"),
      "First line  \nSecond line",
    );
    assert.strictEqual(escapeMarkdownText("a\rb"), "a  \nb");
  });

  test("leaves an unclosed backtick as text", () => {
    assert.strictEqual(
      prettyDiagnosticMessage(
        "Use \x60\x60a \x60 b\x60\x60 or an unclosed \x60snippet",
      ),
      "Use \x60\x60a \x60 b\x60\x60 or an unclosed \\\x60snippet",
    );
  });

  test("only escapes messages above the length limit", () => {
    const formatted = prettyDiagnosticMessage(`'x'${"y".repeat(997)}`);
    assert.deepStrictEqual(codeSpans(formatted), ["'x'"]);

    const huge = "[[ ".repeat(20000);
    const started = Date.now();
    const escaped = prettyDiagnosticMessage(huge);
    assert.ok(
      Date.now() - started < 50,
      `formatting took ${Date.now() - started} ms`,
    );
    assert.strictEqual(escaped, escapeMarkdownText(huge));
    assert.deepStrictEqual(codeSpans(escaped), []);
  });
});
