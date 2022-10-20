export enum LogLevel {
  trace = -2,
  debug = -1,
  info = 0,
  warn = 1,
  error = 2,

  off = 127,
}

export type LogLevelNameType = keyof typeof LogLevel;

export const LogLevelMap: Map<string | undefined, LogLevel> = new Map([
  ["trace", LogLevel.trace],
  ["debug", LogLevel.debug],
  ["info", LogLevel.info],
  ["warn", LogLevel.warn],
  ["error", LogLevel.error],
  ["none", LogLevel.off],
  ["off", LogLevel.off],
  [undefined, LogLevel.info],
]);

export type Arguments = unknown[];

export interface Logger {
  trace(format: string, ...data: Arguments): void;
  debug(format: string, ...data: Arguments): void;
  info(format: string, ...data: Arguments): void;
  warn(format: string, ...data: Arguments): void;
  error(format: string, ...data: Arguments): void;
}
