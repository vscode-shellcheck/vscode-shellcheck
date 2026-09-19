interface CodeRegion {
  start: number;
  end: number;
  value: string;
  // A backtick region owns its delimiters, so merging it with a neighbor would
  // pull those backticks inside the emitted span.
  delimited: boolean;
}

// Detecting regions costs O(n²) when a message is full of unbalanced openers,
// and ShellCheck reports the whole here-document delimiter for SC1044, which
// can be tens of kilobytes. Long messages are escaped only.
const maxFormattedLength = 1000;

// CommonMark allows a backslash escape before any ASCII punctuation character.
const asciiPunctuation = /[!-/:-@[-`{-~]/g;

const parameterPattern = /\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*?#$!_-])/y;
const fdRedirectPattern = /[0-9]+(?:>&|<&)[0-9]+/y;
const optionPattern = /--?[A-Za-z][A-Za-z0-9-]*/y;
const assignmentPattern = /[A-Za-z_][A-Za-z0-9_]*\+?=(?=[$"'({[])/y;
const operatorPattern =
  /<<<|<<-|<<|>>|\|\||&&|\|&|&>|<=|>=|==|!=|=~|\+=|>&|<&|[|&=<>!]/y;
const operatorStart = new Set(["|", "&", "=", "<", ">", "!", "+"]);

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

function escapeSegment(text: string, atLineStart: boolean): string {
  // Leading spaces or tabs would turn the line into an indented code block,
  // which shows the escaping backslashes literally.
  const indent = atLineStart ? (/^[ \t]*/.exec(text)?.[0] ?? "") : "";
  return (
    "&nbsp;".repeat(indent.length) +
    text.slice(indent.length).replace(asciiPunctuation, "\\$&")
  );
}

export function escapeMarkdownText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => escapeSegment(line, true))
    .join("  \n");
}

function codeSpan(value: string): string {
  let longestRun = 0;
  for (const match of value.matchAll(/`+/g)) {
    longestRun = Math.max(longestRun, match[0].length);
  }

  const fence = "`".repeat(longestRun + 1);
  // CommonMark drops one padding space per side, but not from a span made of
  // spaces only, which then needs no padding either.
  const needsPadding = /^[\s`]|[\s`]$/.test(value) && /[^ ]/.test(value);
  return `${fence}${needsPadding ? ` ${value} ` : value}${fence}`;
}

function isQuoteDelimiter(line: string, index: number): boolean {
  const character = line[index];
  if (character !== "'" && character !== '"') {
    return false;
  }

  // Do not treat the apostrophe in Don't, can't, or function's as a quote.
  return !(
    character === "'" &&
    isWordCharacter(line[index - 1]) &&
    isWordCharacter(line[index + 1])
  );
}

function shellRegion(line: string, start: number, end: number): CodeRegion {
  return { start, end, value: line.slice(start, end), delimited: false };
}

function matchRegion(
  pattern: RegExp,
  line: string,
  index: number,
): CodeRegion | undefined {
  pattern.lastIndex = index;
  const match = pattern.exec(line)?.[0];
  return match === undefined
    ? undefined
    : shellRegion(line, index, index + match.length);
}

function findQuotedRegion(line: string, start: number): CodeRegion | undefined {
  const quote = line[start];
  if (!isQuoteDelimiter(line, start)) {
    return undefined;
  }

  for (let index = start + 1; index < line.length; index++) {
    if (line[index] === "\\") {
      index++;
      continue;
    }
    if (line[index] === quote) {
      return shellRegion(line, start, index + 1);
    }
  }

  return undefined;
}

function findBacktickRegion(
  line: string,
  start: number,
): CodeRegion | undefined {
  let runLength = 1;
  while (line[start + runLength] === "`") {
    runLength++;
  }

  const marker = "`".repeat(runLength);
  const end = line.indexOf(marker, start + runLength);
  const value = end < 0 ? "" : line.slice(start + runLength, end);
  return value.length === 0
    ? undefined
    : { start, end: end + runLength, value, delimited: true };
}

function findBalancedRegion(
  line: string,
  start: number,
  open: string,
  close: string,
): CodeRegion | undefined {
  let depth = 0;
  for (let index = start; index < line.length; index++) {
    if (line[index] === open) {
      depth++;
    } else if (line[index] === close && --depth === 0) {
      return shellRegion(line, start, index + 1);
    }
  }
  return undefined;
}

function findDelimitedRegion(
  line: string,
  index: number,
): CodeRegion | undefined {
  const character = line[index];
  if (character === "`") {
    // A backslash-escaped backtick is part of a file name, not a delimiter.
    return line[index - 1] === "\\"
      ? undefined
      : findBacktickRegion(line, index);
  }

  if (
    character === "$" &&
    (line[index + 1] === "'" || line[index + 1] === '"')
  ) {
    const quoted = findQuotedRegion(line, index + 1);
    return quoted && shellRegion(line, index, quoted.end);
  }

  return findQuotedRegion(line, index);
}

function isOperatorTail(line: string, index: number): boolean {
  const character = line[index];
  if (character === undefined || isWhitespace(character)) {
    return true;
  }
  if (!".,;:?)".includes(character)) {
    return false;
  }
  const next = line[index + 1];
  return next === undefined || isWhitespace(next);
}

function findShellRegion(
  line: string,
  index: number,
  covered: Uint8Array,
): CodeRegion | undefined {
  const character = line[index];
  const next = line[index + 1];
  const previous = line[index - 1];

  if (character === "$") {
    if (next === "(") {
      return findBalancedRegion(line, index, "(", ")");
    }
    if (next === "{") {
      return findBalancedRegion(line, index, "{", "}");
    }
    return matchRegion(parameterPattern, line, index);
  }

  if (character === "[" && (next === "[" || isWhitespace(next))) {
    return findBalancedRegion(line, index, "[", "]");
  }

  if (character === "<" && next === "(") {
    const region = findBalancedRegion(line, index + 1, "(", ")");
    return region && shellRegion(line, index, region.end);
  }

  // A parenthesis continues the fragment that precedes it, as in array+=("x").
  if (character === "(" && (next === "(" || covered[index - 1] === 1)) {
    return findBalancedRegion(line, index, "(", ")");
  }

  if (/[0-9]/.test(character ?? "") && !/[0-9]/.test(previous ?? "")) {
    return matchRegion(fdRedirectPattern, line, index);
  }

  if (character === "-" && !isWordCharacter(previous)) {
    return matchRegion(optionPattern, line, index);
  }

  if (/[A-Za-z_]/.test(character ?? "") && !isWordCharacter(previous)) {
    return matchRegion(assignmentPattern, line, index);
  }

  // Only a free-standing operator is shell syntax; key=value, #! or ..| are not.
  if (
    character !== undefined &&
    operatorStart.has(character) &&
    (index === 0 || isWhitespace(previous))
  ) {
    const operator = matchRegion(operatorPattern, line, index);
    if (operator && isOperatorTail(line, operator.end)) {
      return operator;
    }
  }

  return undefined;
}

function findCodeRegions(line: string): CodeRegion[] {
  const regions: CodeRegion[] = [];
  const covered = new Uint8Array(line.length);
  const addRegion = (region: CodeRegion) => {
    regions.push(region);
    covered.fill(1, region.start, region.end);
  };

  for (let index = 0; index < line.length; index++) {
    const region = findDelimitedRegion(line, index);
    if (region) {
      addRegion(region);
      index = region.end - 1;
    }
  }

  for (let index = 0; index < line.length; index++) {
    if (covered[index]) {
      continue;
    }
    const region = findShellRegion(line, index, covered);
    if (region) {
      addRegion(region);
      index = region.end - 1;
    }
  }

  return regions.sort((left, right) => left.start - right.start);
}

function mergeCodeRegions(line: string, regions: CodeRegion[]): CodeRegion[] {
  // A diagnostic can describe one shell fragment in several pieces, such as a
  // command followed by its quoted argument. Keep the pieces in one copyable
  // span, and never emit two spans with nothing between them.
  const merged: CodeRegion[] = [];
  const absorb = (previous: CodeRegion, region: CodeRegion) => {
    previous.end = region.end;
    previous.value = line.slice(previous.start, previous.end);
    previous.delimited = false;
  };

  for (const region of regions) {
    const previous = merged.at(-1);
    if (!previous || !/^[ \t]*$/.test(line.slice(previous.end, region.start))) {
      merged.push({ ...region });
      continue;
    }

    if (region.start < previous.end) {
      if (region.end > previous.end) {
        absorb(previous, region);
      }
      continue;
    }

    if (!previous.delimited && !region.delimited) {
      absorb(previous, region);
      continue;
    }

    if (region.start > previous.end) {
      // Whitespace keeps the spans apart, so the backticks stay outside.
      merged.push({ ...region });
      continue;
    }

    // Nothing separates the two, so one of them has to go: backtick regions
    // become one span of the raw slice, a plain region falls back to text.
    if (previous.delimited && region.delimited) {
      absorb(previous, region);
    } else if (region.delimited) {
      merged[merged.length - 1] = { ...region };
    }
  }

  return merged;
}

function formatLine(line: string): string {
  const regions = mergeCodeRegions(line, findCodeRegions(line));
  let formatted = "";
  let cursor = 0;
  for (const region of regions) {
    formatted += escapeSegment(line.slice(cursor, region.start), cursor === 0);
    formatted += codeSpan(region.value);
    cursor = region.end;
  }
  return formatted + escapeSegment(line.slice(cursor), cursor === 0);
}

export function prettyDiagnosticMessage(message: string): string {
  const normalized = message.replace(/\r\n?/g, "\n");
  if (normalized.length > maxFormattedLength) {
    return escapeMarkdownText(normalized);
  }

  // Each line is formatted on its own: a code region spanning a line break
  // would let the next line open a blockquote, heading, list or HTML block.
  return normalized.split("\n").map(formatLine).join("  \n");
}
