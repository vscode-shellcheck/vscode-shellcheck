// cspell:ignore esac mapfile

const markdownSpecialCharacters = new Set([
  "\\",
  "`",
  "*",
  "_",
  "{",
  "}",
  "[",
  "]",
  "(",
  ")",
  "#",
  "+",
  "-",
  ".",
  "!",
  "|",
  ">",
  "~",
  "<",
]);

const shellWords = new Set([
  "alias",
  "awk",
  "bash",
  "bc",
  "busybox",
  "cat",
  "case",
  "cd",
  "command",
  "declare",
  "echo",
  "elif",
  "else",
  "esac",
  "eval",
  "exec",
  "exit",
  "export",
  "false",
  "fi",
  "find",
  "for",
  "function",
  "grep",
  "if",
  "join",
  "ls",
  "mapfile",
  "mkdir",
  "mv",
  "printf",
  "read",
  "return",
  "rm",
  "sed",
  "set",
  "shift",
  "sh",
  "sort",
  "source",
  "tail",
  "tee",
  "test",
  "tr",
  "then",
  "true",
  "type",
  "unset",
  "until",
  "wait",
  "wc",
  "while",
  "xargs",
  "zsh",
]);

interface CodeRegion {
  start: number;
  end: number;
  value: string;
}

export function escapeMarkdownText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n"), (character) => {
    if (character === "\n") {
      return "  \n";
    }
    if (character === "&") {
      return "&amp;";
    }
    return markdownSpecialCharacters.has(character)
      ? `\\${character}`
      : character;
  }).join("");
}

function codeSpan(value: string): string {
  let longestRun = 0;
  for (const match of value.matchAll(/`+/g)) {
    longestRun = Math.max(longestRun, match[0].length);
  }

  const fence = "`".repeat(longestRun + 1);
  const padded = /^[\s`]|[\s`]$/.test(value) ? ` ${value} ` : value;
  return `${fence}${padded}${fence}`;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

function isQuoteDelimiter(text: string, index: number): boolean {
  const character = text[index];
  if (character !== "'" && character !== '"') {
    return false;
  }

  // Do not treat the apostrophe in Don't, can't, or function's as a quote.
  return !(
    character === "'" &&
    isWordCharacter(text[index - 1]) &&
    isWordCharacter(text[index + 1])
  );
}

function findQuotedRegion(text: string, start: number): CodeRegion | undefined {
  const quote = text[start];
  if (!isQuoteDelimiter(text, start)) {
    return undefined;
  }

  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (text[index] === quote) {
      return { start, end: index + 1, value: text.slice(start, index + 1) };
    }
  }

  return undefined;
}

function findBacktickRegion(
  text: string,
  start: number,
): CodeRegion | undefined {
  let runLength = 1;
  while (text[start + runLength] === "`") {
    runLength++;
  }

  const marker = "`".repeat(runLength);
  const end = text.indexOf(marker, start + runLength);
  if (end < 0) {
    return undefined;
  }

  return {
    start,
    end: end + runLength,
    value: text.slice(start + runLength, end),
  };
}

function findBalancedRegion(
  text: string,
  start: number,
  open: string,
  close: string,
): CodeRegion | undefined {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === open) {
      depth++;
    } else if (text[index] === close && --depth === 0) {
      return { start, end: index + 1, value: text.slice(start, index + 1) };
    }
  }
  return undefined;
}

function isLikelyShellWord(
  text: string,
  start: number,
  end: number,
  covered: Uint8Array,
): boolean {
  const word = text.slice(start, end);
  if (!shellWords.has(word)) {
    return false;
  }

  // `printf` is commonly described as a noun in diagnostics ("the printf
  // format string"), while the other words need a nearby shell fragment or
  // suggestion cue to avoid styling ordinary prose such as "use a test".
  if (word === "printf") {
    return true;
  }

  const before = text.slice(Math.max(0, start - 24), start);
  const hasCue =
    /(?:Use|use|using|invoke|run|call|prefer|instead of|e\.g\.)\s*$/.test(
      before,
    );
  const hasNearbyCode =
    covered[start - 1] === 1 ||
    covered[start - 2] === 1 ||
    covered[end] === 1 ||
    covered[end + 1] === 1;
  return hasCue || hasNearbyCode;
}

function findCodeRegions(message: string): CodeRegion[] {
  const regions: CodeRegion[] = [];
  const covered = new Uint8Array(message.length);
  const addRegion = (region: CodeRegion) => {
    regions.push(region);
    covered.fill(1, region.start, region.end);
  };

  for (let index = 0; index < message.length; index++) {
    const region =
      message[index] === "`"
        ? findBacktickRegion(message, index)
        : findQuotedRegion(message, index);
    if (region) {
      addRegion(region);
      index = region.end - 1;
    }
  }

  for (let index = 0; index < message.length; index++) {
    if (covered[index]) {
      continue;
    }

    let region: CodeRegion | undefined;
    if (message.startsWith("$(", index)) {
      region = findBalancedRegion(message, index, "(", ")");
    } else if (message.startsWith("${", index)) {
      region = findBalancedRegion(message, index, "{", "}");
    } else if (message.startsWith("[[", index)) {
      region = findBalancedRegion(message, index, "[", "]");
    } else if (message[index] === "[" && /\s/.test(message[index + 1] ?? "")) {
      region = findBalancedRegion(message, index, "[", "]");
    } else if (message.startsWith("<(", index)) {
      region = findBalancedRegion(message, index + 1, "(", ")");
      if (region) {
        region.start--;
        region.value = message.slice(region.start, region.end);
      }
    } else if (message.startsWith("((", index)) {
      region = findBalancedRegion(message, index, "(", ")");
    }

    if (!region && message[index] === "$" && !message.startsWith("$(", index)) {
      const parameter = message
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*?#$!_-])/)?.[0];
      if (parameter) {
        region = {
          start: index,
          end: index + parameter.length,
          value: parameter,
        };
      }
    }

    if (!region && /\d/.test(message[index] ?? "")) {
      const operator = message.slice(index).match(/^\d+(?:>&|<&)\d+/)?.[0];
      if (operator) {
        region = {
          start: index,
          end: index + operator.length,
          value: operator,
        };
      }
    }

    const isRedirect =
      /[<>]/.test(message[index] ?? "") &&
      (/[0-9]/.test(message[index - 1] ?? "") ||
        /[<>&]/.test(message[index + 1] ?? "") ||
        /\s/.test(message[index + 1] ?? "") ||
        message[index + 1] === "(");
    const isOption =
      message[index] === "-" && !/[A-Za-z0-9_]/.test(message[index - 1] ?? "");
    if (
      !region &&
      (isOption || /[|&=!]/.test(message[index] ?? "") || isRedirect)
    ) {
      const operator = message
        .slice(index)
        .match(
          /^(?:--?[A-Za-z][A-Za-z0-9-]*|\|\||\||&&|\|&|[=!]=?~?|[<>]&?)/,
        )?.[0];
      if (operator) {
        region = {
          start: index,
          end: index + operator.length,
          value: operator,
        };
      }
    }

    if (region && !covered[region.start]) {
      addRegion(region);
      index = region.end - 1;
    }
  }

  for (const match of message.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!covered[start] && isLikelyShellWord(message, start, end, covered)) {
      addRegion({ start, end, value: match[0] });
    }
  }

  return regions.sort((left, right) => left.start - right.start);
}

function mergeCodeRegions(
  message: string,
  regions: CodeRegion[],
): CodeRegion[] {
  const merged: CodeRegion[] = [];
  for (const region of regions) {
    const previous = merged.at(-1);
    if (previous && region.start < previous.end) {
      if (region.end > previous.end) {
        previous.end = region.end;
        previous.value = message.slice(previous.start, region.end);
      }
      continue;
    }
    if (
      previous &&
      /^[ \t]*$/.test(message.slice(previous.end, region.start))
    ) {
      previous.end = region.end;
      previous.value = message.slice(previous.start, region.end);
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
}

export function prettyDiagnosticMessage(message: string): string {
  const normalized = message.replace(/\r\n?/g, "\n");
  const regions = mergeCodeRegions(normalized, findCodeRegions(normalized));
  const output: string[] = [];
  let cursor = 0;
  for (const region of regions) {
    if (region.start < cursor) {
      continue;
    }
    output.push(escapeMarkdownText(normalized.slice(cursor, region.start)));
    output.push(codeSpan(region.value));
    cursor = region.end;
  }
  output.push(escapeMarkdownText(normalized.slice(cursor)));
  return output.join("");
}
