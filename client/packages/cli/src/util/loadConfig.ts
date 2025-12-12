import {
  loadConfig as _loadConfig,
  LoadConfigOptions,
  LoadConfigResult,
} from 'unconfig';
import { createRequire } from 'module';
import path from 'path';
import { findProjectDir } from './projectDir.js';

/**
 * Resolve @instantdb packages from CLI's dependency tree.
 * For Deno projects, we alias all common @instantdb packages to @instantdb/core
 * since they all re-export the schema types from core.
 */
function getInstantAliases(): Record<string, string> | null {
  try {
    const require = createRequire(import.meta.url);
    const platformPath = require.resolve('@instantdb/platform');
    const platformRequire = createRequire(platformPath);
    // Resolve the package.json to get the actual package root
    const corePackageJson = platformRequire.resolve(
      '@instantdb/core/package.json',
    );
    const coreDir = path.dirname(corePackageJson);
    // All @instantdb packages re-export schema types from core,
    // so we can alias them all to core for schema loading purposes
    return {
      '@instantdb/core': coreDir,
      '@instantdb/react': coreDir,
      '@instantdb/react-native': coreDir,
      '@instantdb/admin': coreDir,
    };
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
  const alias = isDeno ? getInstantAliases() : null;

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
