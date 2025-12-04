import {
  loadConfig as _loadConfig,
  LoadConfigOptions,
  LoadConfigResult,
} from 'unconfig';
import { createRequire } from 'module';
import path from 'path';
import { findProjectDir } from './projectDir.js';

/**
 * Resolve @instantdb/core from CLI's dependency tree.
 * CLI depends on @instantdb/platform which depends on @instantdb/core.
 */
function getInstantCoreAlias(): Record<string, string> | null {
  try {
    const require = createRequire(import.meta.url);
    const platformPath = require.resolve('@instantdb/platform');
    const platformRequire = createRequire(platformPath);
    // Resolve the package.json to get the actual package root
    const corePackageJson = platformRequire.resolve(
      '@instantdb/core/package.json',
    );
    const coreDir = path.dirname(corePackageJson);
    return { '@instantdb/core': coreDir };
  } catch {
    return null;
  }
}

export async function loadConfig<T>(
  opts: LoadConfigOptions<T>,
): Promise<LoadConfigResult<T>> {
  // Only use alias for Deno projects (Node projects use their own node_modules)
  const projectInfo = await findProjectDir();
  const isDeno = projectInfo?.type === 'deno';
  const alias = isDeno ? getInstantCoreAlias() : null;

  const res = await _loadConfig({
    ...opts,
    ...(alias && {
      importx: {
        ...opts.importx,
        loaderOptions: {
          ...opts.importx?.loaderOptions,
          jiti: {
            ...opts.importx?.loaderOptions?.jiti,
            alias,
          },
        },
      },
    }),
  });

  // Unconfig seems to add an __esModule property to the config object
  // Removing it.
  if (typeof res.config === 'object' && '__esModule' in res.config!) {
    delete res.config.__esModule;
  }
  return res;
}
