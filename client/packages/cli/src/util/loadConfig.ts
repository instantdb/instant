import { loadConfig as _loadConfig } from 'unconfig';
import type {
  LoadConfigOptions,
  LoadConfigResult,
  LoadConfigSource,
} from 'unconfig';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findProjectDir } from './projectDir.ts';

type Arrayable<T> = T | T[];

const toArray = <T>(value: Arrayable<T>): T[] =>
  Array.isArray(value) ? value : [value];

/**
 * Resolve @instantdb packages from the CLI's own dependencies for
 * projects without node_modules. All @instantdb packages re-export
 * schema types from core, so a single core alias covers them all.
 */
function getInstantAliases(): Record<string, string> | null {
  try {
    const require = createRequire(import.meta.url);
    const corePackageJson = require.resolve('@instantdb/core/package.json');
    const coreDir = path.dirname(corePackageJson);
    return {
      '@instantdb/core': coreDir,
      '@instantdb/react': coreDir,
      '@instantdb/react-native': coreDir,
      '@instantdb/svelte': coreDir,
      '@instantdb/vue': coreDir,
      '@instantdb/admin': coreDir,
    };
  } catch {
    return null;
  }
}

function withAliases<T>(
  opts: LoadConfigOptions<T>,
  alias: Record<string, string>,
): LoadConfigOptions<T> {
  return {
    ...opts,
    sources: toArray(opts.sources).map((source): LoadConfigSource<T> => {
      if (source.parser === 'json' || typeof source.parser === 'function') {
        return source;
      }

      return {
        ...source,
        parser: async (filepath) => {
          const localRequire = createRequire(import.meta.url);
          const unconfigRequire = createRequire(
            localRequire.resolve('unconfig/package.json'),
          );
          const { createJiti } = unconfigRequire('jiti');
          const jiti = createJiti(import.meta.url, {
            fsCache: false,
            moduleCache: false,
            interopDefault: true,
            alias,
          });

          return jiti.import(filepath, { default: true });
        },
      };
    }),
  };
}

export async function loadConfig<T>(
  opts: LoadConfigOptions<T>,
): Promise<LoadConfigResult<T>> {
  const projectInfo = await findProjectDir();
  const needsAliases =
    projectInfo?.type === 'deno' || projectInfo?.type === 'python';

  let res;
  if (needsAliases) {
    const alias = getInstantAliases();
    res = await _loadConfig(alias ? withAliases(opts, alias) : opts);
  } else {
    res = await _loadConfig(opts);
  }

  // Unconfig seems to add an __esModule property to the config object
  // Removing it.
  if (typeof res.config === 'object' && '__esModule' in res.config!) {
    delete res.config.__esModule;
  }
  return res;
}
