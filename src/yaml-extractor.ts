import * as vscode from "vscode";
import * as yaml from "js-yaml";

export interface ShellSnippet {
  content: string;
  startLine: number; // 0-based line in YAML where content starts
  columnOffset: number; // 0-based column offset (indentation of content)
  shell: string;
}

interface WorkflowJob {
  defaults?: { run?: { shell?: string } };
  steps?: WorkflowStep[];
}

interface WorkflowStep {
  run?: string;
  shell?: string;
}

interface Workflow {
  defaults?: { run?: { shell?: string } };
  jobs?: Record<string, WorkflowJob>;
}

interface CompositeAction {
  runs?: {
    using?: string;
    steps?: WorkflowStep[];
  };
}

const WORKFLOW_PATH_PATTERN = /[/\\]\.github[/\\]workflows[/\\][^/\\]+\.ya?ml$/;
const ACTION_FILE_PATTERN = /[/\\]action\.ya?ml$/;
const SHELL_DIALECTS = ["bash", "sh", "dash", "ksh"];

const YAML_LANGUAGE_IDS = ["yaml", "github-actions-workflow"];

export function isGitHubWorkflowFile(doc: vscode.TextDocument): boolean {
  if (!YAML_LANGUAGE_IDS.includes(doc.languageId)) {
    return false;
  }
  return (
    WORKFLOW_PATH_PATTERN.test(doc.uri.fsPath) ||
    ACTION_FILE_PATTERN.test(doc.uri.fsPath)
  );
}

export function extractShellSnippets(doc: vscode.TextDocument): ShellSnippet[] {
  const text = doc.getText();
  let parsed: Workflow & CompositeAction;
  try {
    parsed = yaml.load(text) as Workflow & CompositeAction;
  } catch {
    return []; // Invalid YAML, let YAML linter handle it
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const snippets: ShellSnippet[] = [];

  // Handle workflow files (jobs.<job>.steps[].run)
  if (parsed.jobs) {
    const globalDefaultShell = parsed.defaults?.run?.shell;

    for (const [, job] of Object.entries(parsed.jobs)) {
      if (!job || !job.steps) continue;

      const jobDefaultShell = job.defaults?.run?.shell ?? globalDefaultShell;

      for (const step of job.steps) {
        const snippet = extractStepSnippet(text, step, jobDefaultShell);
        if (snippet) snippets.push(snippet);
      }
    }
  }

  // Handle composite action files (runs.steps[].run)
  if (parsed.runs?.using === "composite" && parsed.runs.steps) {
    for (const step of parsed.runs.steps) {
      const snippet = extractStepSnippet(text, step, "bash");
      if (snippet) snippets.push(snippet);
    }
  }

  return snippets;
}

function extractStepSnippet(
  text: string,
  step: WorkflowStep,
  defaultShell: string | undefined,
): ShellSnippet | null {
  if (!step || typeof step.run !== "string") return null;

  const shell = step.shell ?? defaultShell ?? "bash";
  if (!SHELL_DIALECTS.includes(shell)) return null;

  const runContent = step.run;
  if (!runContent.trim()) return null;

  const location = findRunContentLocation(text, step.run);
  if (!location) return null;

  return {
    content: runContent,
    startLine: location.line,
    columnOffset: location.column,
    shell,
  };
}

interface ContentLocation {
  line: number;
  column: number;
}

function findRunContentLocation(
  text: string,
  runContent: string,
): ContentLocation | null {
  const lines = text.split("\n");

  // Find lines that start a run: block
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const runMatch = line.match(/^(\s*)[-]?\s*run:\s*(.*)$/);
    if (!runMatch) continue;

    const afterRun = runMatch[2].trim();

    // Inline run: echo hello
    if (afterRun && !afterRun.startsWith("|") && !afterRun.startsWith(">")) {
      if (afterRun === runContent.trim()) {
        // Column is where the content starts after "run: "
        const contentStart = line.indexOf(afterRun);
        return { line: i, column: contentStart };
      }
      continue;
    }

    // Multiline: run: | or run: >
    if (afterRun.startsWith("|") || afterRun.startsWith(">")) {
      const blockContent = extractBlockContent(lines, i + 1);
      if (normalizeContent(blockContent) === normalizeContent(runContent)) {
        // Find first non-empty line and its indentation
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            const indent = lines[j].match(/^(\s*)/)?.[1].length ?? 0;
            return { line: j, column: indent };
          }
        }
      }
    }
  }

  return null;
}

function extractBlockContent(lines: string[], startIdx: number): string {
  if (startIdx >= lines.length) return "";

  // Find indentation of first content line
  let baseIndent = -1;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    baseIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    break;
  }

  if (baseIndent === -1) return "";

  const contentLines: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // Empty lines are included
    if (!line.trim()) {
      contentLines.push("");
      continue;
    }

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent < baseIndent) break;

    // Remove base indentation
    contentLines.push(line.substring(baseIndent));
  }

  // Trim trailing empty lines
  while (contentLines.length && !contentLines[contentLines.length - 1].trim()) {
    contentLines.pop();
  }

  return contentLines.join("\n");
}

function normalizeContent(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

/**
 * Replace GitHub Actions expressions ${{ ... }} with same-length shell variables.
 * This prevents shellcheck from complaining about syntax it doesn't understand.
 */
export function replaceGitHubExpressions(content: string): string {
  // Use non-greedy match to handle nested braces like ${{ fromJSON(x).y }}
  return content.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => {
    // Replace with ${_:-x...x} to maintain same length
    // ${{ foo }} (11 chars) -> ${_:-xxxxx} (11 chars)
    // The :-x provides a default value so shellcheck won't warn about unset var
    const prefix = "${_:-";
    const suffix = "}";
    const fillerLen = match.length - prefix.length - suffix.length;
    if (fillerLen >= 0) {
      return prefix + "x".repeat(fillerLen) + suffix;
    }
    // Fallback for very short expressions (shouldn't happen)
    return "$" + "_".repeat(match.length - 1);
  });
}
