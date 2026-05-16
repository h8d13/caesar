import { config } from './config';

// Lightweight stdout/stderr logger. Plain text, no ANSI, no banners.
// Docker captures stdout/stderr — that's where you read these.
//
// Levels: debug only fires when config.server.debug is true.
// info/warn/error always fire.

type Args = unknown[];

const format = (level: string, args: Args): string => {
  const ts = new Date().toISOString();
  const parts = args.map((a) =>
    typeof a === 'string'
      ? a
      : a instanceof Error
        ? (a.stack ?? a.message)
        : JSON.stringify(a)
  );
  return `${ts} ${level} ${parts.join(' ')}`;
};

const logger = {
  debug: (...args: Args) => {
    if (!config.server.debug) return;
    console.log(format('DEBUG', args));
  },
  info: (...args: Args) => {
    console.log(format('INFO', args));
  },
  warn: (...args: Args) => {
    console.warn(format('WARN', args));
  },
  error: (...args: Args) => {
    console.error(format('ERROR', args));
  }
};

export { logger };
