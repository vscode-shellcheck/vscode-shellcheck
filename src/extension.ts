import * as vscode from "vscode";
import { ShellCheckExtensionApi } from "./api.js";
import { LinkifyProvider } from "./linkify.js";
import ShellCheckProvider from "./linter.js";
import { registerLogger, setLoggingLevel } from "./utils/logging/index.js";
import { OutputChannelLogger } from "./utils/logging/logger-outputchannel.js";
import { LogLevelNameType } from "./utils/logging/types.js";
import { MarkdownDiagnosticProvider } from "./markdown-diagnostics.js";

export function activate(
  context: vscode.ExtensionContext,
): ShellCheckExtensionApi {
  // Setup logging
  const outputChannel = vscode.window.createOutputChannel(
    "ShellCheck",
    "shellcheck-output",
  );
  context.subscriptions.push(outputChannel);

  const logger = new OutputChannelLogger(outputChannel);
  context.subscriptions.push(registerLogger(logger));

  // logging level
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("shellcheck.logLevel")) {
        updateLoggingLevel();
      }
    }),
  );
  updateLoggingLevel();

  const linter = new ShellCheckProvider(context);
  context.subscriptions.push(linter);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ShellCheckProvider.LANGUAGES,
      new MarkdownDiagnosticProvider((uri) => linter.getDiagnostics(uri)),
    ),
  );

  // link provider
  for (const language of ShellCheckProvider.LANGUAGES) {
    const linker = vscode.languages.registerDocumentLinkProvider(
      language,
      new LinkifyProvider(),
    );
    context.subscriptions.push(linker);
  }

  // public API surface
  return linter.provideApi();
}

export function deactivate(): void {}

function updateLoggingLevel(): void {
  const settings = vscode.workspace.getConfiguration("shellcheck");
  setLoggingLevel(settings.get<LogLevelNameType>("logLevel"));
}
