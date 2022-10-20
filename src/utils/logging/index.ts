import * as vscode from "vscode";
import {
  Arguments,
  Logger,
  LogLevel,
  LogLevelMap,
  LogLevelNameType,
} from "./types";

let loggers: Logger[] = [];
let globalLogLevel: LogLevel;

export function registerLogger(logger: Logger): vscode.Disposable {
  loggers.push(logger);
  return {
    dispose: () => {
      loggers = loggers.filter((l) => l !== logger);
    },
  };
}

export function setLoggingLevel(level?: LogLevelNameType): void {
  globalLogLevel = LogLevelMap.get(level) ?? LogLevel.error;
}

export function error(format: string, ...args: Arguments): void {
  if (globalLogLevel <= LogLevel.error) {
    loggers.forEach((l) => l.error(format, ...args));
  }
}

export function warn(format: string, ...args: Arguments): void {
  if (globalLogLevel <= LogLevel.warn) {
    loggers.forEach((l) => l.warn(format, ...args));
  }
}

export function info(format: string, ...args: Arguments): void {
  if (globalLogLevel <= LogLevel.info) {
    loggers.forEach((l) => l.info(format, ...args));
  }
}

export function debug(format: string, ...args: Arguments): void {
  if (globalLogLevel <= LogLevel.debug) {
    loggers.forEach((l) => l.debug(format, ...args));
  }
}

export function trace(format: string, ...args: Arguments): void {
  if (globalLogLevel <= LogLevel.trace) {
    loggers.forEach((l) => l.trace(format, ...args));
  }
}
