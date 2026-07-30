import envPaths from 'env-paths';
import { join } from 'node:path';

export function getAuthPaths() {
  const dev = ['true', 'yes', 'on', '1'].includes(
    process.env.INSTANT_CLI_DEV ?? '',
  );
  const key = `instantdb-${dev ? 'dev' : 'prod'}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, 'a');

  return { authConfigFilePath, appConfigDirPath };
}
