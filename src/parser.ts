import * as semver from "semver";
import * as vscode from "vscode";
import { MINIMUM_TOOL_VERSION } from "./utils/tool-check";

interface ShellCheckReplacement {
  precedence: number;
  line: number;
  endLine: number;
  column: number;
  endColumn: number;
  insertionPoint: string;
  replacement: string;
}

interface ShellCheckProblem {
  file: string;
  line: number;
  endLine?: number;
  column: number;
  endColumn?: number;
  level: string;
  code: number;
  message: string;
  fix?: {
    replacements: ShellCheckReplacement[];
  };
}

export interface Parser {
  readonly outputFormat: string;
  readonly textDocument: vscode.TextDocument;

  parse(s: string): ParseResult[];
}

export interface ParseResult {
  diagnostic: vscode.Diagnostic;
  codeAction: vscode.CodeAction | null;
}

export interface ParserOptions {
  toolVersion?: semver.SemVer | null;
  enableQuickFix?: boolean;
}

class JsonParserMixin {
  constructor(protected options?: ParserOptions) {}

  protected doParse(
    textDocument: vscode.TextDocument,
    problems: ShellCheckProblem[],
  ): ParseResult[] {
    const result: ParseResult[] = [];
    for (const problem of problems) {
      if (!problem) {
        continue;
      }

      const diagnostic = this.makeDiagnostic(problem);
      const codeAction = this.options?.enableQuickFix
        ? this.makeCodeAction(problem, textDocument, diagnostic)
        : null;
      result.push({
        diagnostic,
        codeAction,
      });
    }

    return result;
  }

  protected makeCodeAction(
    problem: ShellCheckProblem,
    textDocument: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): vscode.CodeAction | null {
    if (!problem.fix || problem.fix.replacements.length === 0) {
      return null;
    }

    const edits = this.createTextEdits(problem.fix.replacements);
    if (!edits.length) {
      return null;
    }

    const fix = new vscode.CodeAction(
      // We use the "ShellCheck:" prefix to filter code actions in Fix All.
      `ShellCheck: Apply fix for SC${problem.code}`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];
    fix.isPreferred = true;
    fix.edit = new vscode.WorkspaceEdit();
    fix.edit.set(textDocument.uri, edits);
    return fix;
  }

  private createTextEdits(
    replacements: ShellCheckReplacement[],
  ): vscode.TextEdit[] {
    if (replacements.length === 1) {
      return [this.createTextEdit(replacements[0])];
    } else if (replacements.length === 2) {
      return [
        this.createTextEdit(replacements[1]),
        this.createTextEdit(replacements[0]),
      ];
    }

    return [];
  }

  private createTextEdit(repl: ShellCheckReplacement): vscode.TextEdit {
    const startPos = this.fixPosition(
      new vscode.Position(repl.line - 1, repl.column - 1),
    );
    const endPos = this.fixPosition(
      new vscode.Position(repl.endLine - 1, repl.endColumn - 1),
    );
    return new vscode.TextEdit(
      new vscode.Range(startPos, endPos),
      repl.replacement,
    );
  }

  protected makeDiagnostic(problem: ShellCheckProblem): vscode.Diagnostic {
    let startPos = new vscode.Position(problem.line - 1, problem.column - 1);
    const endLine = problem.endLine ? problem.endLine - 1 : startPos.line;
    const endCharacter = problem.endColumn
      ? problem.endColumn - 1
      : startPos.character;
    let endPos = new vscode.Position(endLine, endCharacter);
    if (startPos.isEqual(endPos)) {
      startPos = this.fixPosition(startPos);
      endPos = startPos;
    } else {
      startPos = this.fixPosition(startPos);
      endPos = this.fixPosition(endPos);
    }

    const range = new vscode.Range(startPos, endPos);
    const severity = convertSeverity(problem.level);
    const diagnostic = new vscode.Diagnostic(range, problem.message, severity);
    diagnostic.source = "shellcheck";
    diagnostic.code = {
      value: `SC${problem.code}`,
      target: vscode.Uri.parse(
        `https://www.shellcheck.net/wiki/SC${problem.code}`,
      ),
    };
    diagnostic.tags = scCodeToDiagnosticTags(problem.code);
    return diagnostic;
  }

  protected fixPosition(pos: vscode.Position): vscode.Position {
    return pos;
  }
}

// Compatibility parser
class JsonParser extends JsonParserMixin implements Parser {
  public readonly outputFormat = "json";

  constructor(
    public readonly textDocument: vscode.TextDocument,
    options?: ParserOptions,
  ) {
    super(options);
  }

  public parse(s: string): ParseResult[] {
    const problems = <ShellCheckProblem[]>JSON.parse(s);
    return this.doParse(this.textDocument, problems);
  }

  protected fixPosition(pos: vscode.Position): vscode.Position {
    // Since json format treats tabs as **8** characters, we need to offset it.
    let charPos = pos.character;
    const s = this.textDocument.getText(
      new vscode.Range(pos.with({ character: 0 }), pos),
    );
    for (const ch of s) {
      if (ch === "\t") {
        charPos -= 7;
      }
    }

    return pos.with({ character: charPos });
  }
}

class Json1Parser extends JsonParserMixin implements Parser {
  public readonly outputFormat = "json1";

  constructor(
    public readonly textDocument: vscode.TextDocument,
    options?: ParserOptions,
  ) {
    super(options);
  }

  public parse(s: string): ParseResult[] {
    const result = <{ comments: ShellCheckProblem[] }>JSON.parse(s);
    return this.doParse(this.textDocument, result.comments);
  }
}

function convertSeverity(level: string): vscode.DiagnosticSeverity {
  switch (level) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "style":
    /* falls through */
    case "info":
      return vscode.DiagnosticSeverity.Information;
    case "warning":
    /* falls through */
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

// https://github.com/koalaman/shellcheck/wiki
const codeToTags: { [name: number]: vscode.DiagnosticTag[] } = {
  2006: [vscode.DiagnosticTag.Deprecated],
  2007: [vscode.DiagnosticTag.Deprecated],
  2034: [vscode.DiagnosticTag.Unnecessary],
  2186: [vscode.DiagnosticTag.Deprecated],
  2196: [vscode.DiagnosticTag.Deprecated],
  2197: [vscode.DiagnosticTag.Deprecated],
};

function scCodeToDiagnosticTags(
  code: number,
): vscode.DiagnosticTag[] | undefined {
  return codeToTags[code];
}

export function createParser(
  textDocument: vscode.TextDocument,
  options?: ParserOptions,
): Parser {
  if (
    options &&
    options.toolVersion &&
    semver.gte(options.toolVersion, MINIMUM_TOOL_VERSION)
  ) {
    return new Json1Parser(textDocument, options);
  }

  return new JsonParser(textDocument, options);
}
