import type { TDiskMetrics } from '@sharkord/shared';
import fs from 'fs/promises';
import { getUsedFileQuota } from '../db/queries/files';
import { UPLOADS_PATH } from '../helpers/paths';

const getDiskMetrics = async (): Promise<TDiskMetrics> => {
  const [stats, filesUsedSpace] = await Promise.all([
    fs.statfs(UPLOADS_PATH),
    getUsedFileQuota()
  ]);

  const totalSpace = stats.blocks * stats.bsize;
  const freeSpace = stats.bavail * stats.bsize;
  const usedSpace = totalSpace - freeSpace;

  const metrics: TDiskMetrics = {
    totalSpace,
    usedSpace,
    freeSpace,
    sharkordUsedSpace: filesUsedSpace
  };

  return metrics;
};

export { getDiskMetrics };
