import * as vscode from "vscode";

interface ArtifactDiagnostic {
  file: string;
  code: string;
  severity: string;
  line: number;
}

const collected = new Map<string, ArtifactDiagnostic[]>();

function codeOf(diagnostic: vscode.Diagnostic): string {
  const code = diagnostic.code;
  return String(typeof code === "object" ? code.value : code);
}

function workspaceUri(relativePath: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("The web test workspace is not open");
  return vscode.Uri.joinPath(folder.uri, ...relativePath.split("/"));
}

async function open(relativePath: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(
    workspaceUri(relativePath),
  );
  await vscode.window.showTextDocument(document);
  return document;
}

function fingerprint(diagnostics: readonly vscode.Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => `${codeOf(diagnostic)}:${diagnostic.range.start.line}`)
    .sort()
    .join(",");
}

async function waitForDiagnostics(
  document: vscode.TextDocument,
  previous: string | undefined,
  accept: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
): Promise<readonly vscode.Diagnostic[]> {
  const current = vscode.languages.getDiagnostics(document.uri);
  if (fingerprint(current) !== previous && accept(current)) return current;

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(
        new Error(`Timed out waiting for diagnostics for ${document.uri}`),
      );
    }, 55_000);
    const disposable = vscode.languages.onDidChangeDiagnostics((event) => {
      if (
        !event.uris.some((uri) => uri.toString() === document.uri.toString())
      ) {
        return;
      }
      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      if (fingerprint(diagnostics) === previous || !accept(diagnostics)) return;
      clearTimeout(timeout);
      disposable.dispose();
      resolve(diagnostics);
    });
  });
}

function record(
  relativePath: string,
  diagnostics: readonly vscode.Diagnostic[],
): void {
  collected.set(
    relativePath,
    diagnostics.map((diagnostic) => ({
      file: relativePath,
      code: codeOf(diagnostic),
      severity: vscode.DiagnosticSeverity[diagnostic.severity],
      line: diagnostic.range.start.line,
    })),
  );
}

async function updateSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration("shellcheck")
    .update(key, value, vscode.ConfigurationTarget.Workspace);
}

suite("ShellCheck for VS Code for the Web", () => {
  suiteSetup(async () => {
    await updateSetting("runtime", "native");
    await updateSetting("run", "onType");
  });

  suiteTeardown(async () => {
    const diagnostics = [...collected.values()]
      .flat()
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.line - b.line ||
          a.code.localeCompare(b.code) ||
          a.severity.localeCompare(b.severity),
      );
    const directory = workspaceUri(".e2e-artifacts");
    await vscode.workspace.fs.createDirectory(directory);
    const artifact = vscode.Uri.joinPath(directory, "web-diagnostics.json");
    await vscode.workspace.fs.writeFile(
      artifact,
      new TextEncoder().encode(`${JSON.stringify(diagnostics, null, 2)}\n`),
    );

    // @vscode/test-web intentionally keeps workspace writes in memory, so the
    // host runner receives the exact bytes read back through workspace.fs.
    const receiverUrl = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(directory, "receiver-url"),
      ),
    );
    const bytes = await vscode.workspace.fs.readFile(artifact);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const response = await fetch(receiverUrl, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      throw new Error(`Unable to export web artifact: HTTP ${response.status}`);
    }
  });

  test("resolves source files through the workspace", async () => {
    await updateSetting("customArgs", ["-x"]);
    const path = "src/sources.sh";
    const document = await open(path);
    const diagnostics = await waitForDiagnostics(document, undefined, (items) =>
      items.some((item) => codeOf(item) === "SC2086"),
    );
    const codes = diagnostics.map(codeOf);
    assert(!codes.includes("SC1091"), "source target was not resolved");
    assert(!codes.includes("SC2154"), "sourced variable was not resolved");
    record(path, diagnostics);
  });

  test("honors .shellcheckrc at the workspace root", async () => {
    await updateSetting("customArgs", undefined);
    const path = "root-rc.sh";
    const document = await open(path);
    const diagnostics = await waitForDiagnostics(document, undefined, (items) =>
      items.some((item) => codeOf(item) === "SC2086"),
    );
    assert(
      !diagnostics.some((item) => codeOf(item) === "SC2034"),
      "workspace .shellcheckrc was ignored",
    );
    record(path, diagnostics);
  });

  test("lints with wasm when the workspace requests native", async () => {
    const path = "plain/plain.sh";
    const document = await open(path);
    const diagnostics = await waitForDiagnostics(document, undefined, (items) =>
      items.some((item) => codeOf(item) === "SC2086"),
    );
    record(path, diagnostics);
  });

  test("re-lints an edited document on type", async () => {
    const path = "plain/plain.sh";
    const document = await open(path);
    const before = vscode.languages.getDiagnostics(document.uri);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      document.uri,
      document.lineAt(document.lineCount - 1).range.end,
      "\necho $NEW_VALUE",
    );
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error("Unable to edit the web fixture");
    }
    const diagnostics = await waitForDiagnostics(
      document,
      fingerprint(before),
      (items) => items.some((item) => codeOf(item) === "SC2154"),
    );
    record(path, diagnostics);
  });
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
