import * as vscode from "vscode";
import { formatLogMessage } from "../../platform/index.js";
import { Arguments, Logger, LogLevel } from "./types.js";

function formatMessage(
  level: string,
  format: string,
  ...data: Arguments
): string {
  const date = new Date();
  return `[${date.toISOString()}] [${level.toUpperCase()}] ${formatLogMessage(format, ...data)}`;
}

export class OutputChannelLogger implements Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  trace(format: string, ...data: Arguments): void {
    this.channel.appendLine(
      formatMessage(LogLevel[LogLevel.trace], format, ...data),
    );
  }

  debug(format: string, ...data: Arguments): void {
    this.channel.appendLine(
      formatMessage(LogLevel[LogLevel.debug], format, ...data),
    );
  }

  info(format: string, ...data: Arguments): void {
    this.channel.appendLine(
      formatMessage(LogLevel[LogLevel.info], format, ...data),
    );
  }

  warn(format: string, ...data: Arguments): void {
    this.channel.appendLine(
      formatMessage(LogLevel[LogLevel.warn], format, ...data),
    );
  }

  error(format: string, ...data: Arguments): void {
    this.channel.appendLine(
      formatMessage(LogLevel[LogLevel.error], format, ...data),
    );
  }
}
