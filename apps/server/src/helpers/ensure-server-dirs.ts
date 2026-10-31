import path from 'path';
import { ensureDir } from './fs';
import * as serverPaths from './paths';

const ensureServerDirs = async () => {
  const pathsList = Object.values(serverPaths);
  // build assets are read-only inputs, never created at runtime
  const IGNORE_LIST = new Set([
    serverPaths.DRIZZLE_PATH,
    serverPaths.INTERFACE_PATH
  ]);

  const promises = pathsList.map(async (dir) => {
    if (!dir || typeof dir !== 'string') return;

    const resolvedPath = path.resolve(process.cwd(), dir);
    const extension = path.extname(resolvedPath);

    if (extension || IGNORE_LIST.has(resolvedPath)) return;

    await ensureDir(resolvedPath);
  });

  await Promise.all(promises);
};

export { ensureServerDirs };
