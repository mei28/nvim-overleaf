// Structured logger with configurable levels.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

/** Simple sprintf-like formatting: %s for strings, %d for numbers. */
function format(msg: string, args: unknown[]): string {
  let i = 0;
  return msg.replace(/%[sd]/g, () => {
    if (i >= args.length) return '%?';
    return String(args[i++]);
  });
}

function log(level: LogLevel, msg: string, ...args: unknown[]): void {
  if (!shouldLog(level)) return;
  const prefix = `[overleaf:${level}]`;
  const formatted = args.length > 0 ? format(msg, args) : msg;
  console.error(prefix, formatted);
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
};
