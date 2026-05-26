import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const ensureDir = async (path: string) => {
  await fs.mkdir(path, { recursive: true });
};

const getAppDataPath = (): string => {
  const platform = process.platform;

  // Linux → ~/.config
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
};

export { ensureDir, getAppDataPath };
