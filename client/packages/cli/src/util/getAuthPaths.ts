import envPaths from 'env-paths';
import { join } from 'node:path';

const dev = Boolean(process.env.INSTANT_CLI_DEV);

export function getAuthPaths() {
  const key = `instantdb-${dev ? 'dev' : 'prod'}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, 'a');

  return { authConfigFilePath, appConfigDirPath };
}
