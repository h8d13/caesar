import { CronJob } from 'cron';
import { logger } from '../logger';
import { cleanupFiles } from './cleanup-files';
import { pruneExpiredMessages } from './prune-expired';

enum CRON_TIMES {
  EVERY_15_MINUTES = '*/15 * * * *'
}

const loadCrons = () => {
  logger.debug('Loading crons...');

  new CronJob(
    CRON_TIMES.EVERY_15_MINUTES,
    cleanupFiles,
    null,
    true,
    'Europe/Lisbon',
    null,
    true
  );

  new CronJob(
    CRON_TIMES.EVERY_15_MINUTES,
    pruneExpiredMessages,
    null,
    true,
    'Europe/Lisbon',
    null,
    true
  );
};

export { loadCrons };
