import { format as formatArgs } from 'node:util';
import { config } from './config';

// Lightweight stdout/stderr logger. Plain text, no ANSI, no banners.
// Levels: debug only fires when config.server.debug is true.
// info/warn/error always fire.
//
// Uses util.format (same as console.log) so printf specifiers interpolate
// (`logger.info('%s joined', name)` -> 'X joined') while extra/plain args
// still space-join and Errors print their stack.

type Args = unknown[];

const format = (level: string, args: Args): string => {
  const ts = new Date().toISOString();
  return `${ts} ${level} ${formatArgs(...args)}`;
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
