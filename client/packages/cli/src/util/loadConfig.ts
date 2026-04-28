import { loadConfig as _loadConfig } from 'unconfig';
import type {
  LoadConfigOptions,
  LoadConfigResult,
  LoadConfigSource,
} from 'unconfig';
import { createRequire } from 'module';
import path from 'path';
import { findProjectDir } from './projectDir.ts';

type Arrayable<T> = T | T[];

const toArray = <T>(value: Arrayable<T>): T[] =>
  Array.isArray(value) ? value : [value];

/**
 * Resolve @instantdb packages from CLI's dependency tree.
 * For Deno projects, we alias all common @instantdb packages to @instantdb/core
 * since they all re-export the schema types from core.
 */
function getInstantAliases(): Record<string, string> | null {
  try {
    const require = createRequire(import.meta.url);
    // Resolve @instantdb/core directly from CLI's dependencies
    const corePackageJson = require.resolve('@instantdb/core/package.json');
    const coreDir = path.dirname(corePackageJson);
    // All @instantdb packages re-export schema types from core,
    // so we can alias them all to core for schema loading purposes
    return {
      '@instantdb/core': coreDir,
      '@instantdb/react': coreDir,
      '@instantdb/react-native': coreDir,
      '@instantdb/svelte': coreDir,
      '@instantdb/admin': coreDir,
    };
  } catch {
    return null;
  }
}

function withDenoAliases<T>(
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
  const isDeno = projectInfo?.type === 'deno';

  // Deno projects don't have node_modules, so we need to alias @instantdb/*
  // packages to resolve from the CLI's own dependencies
  let res;
  if (isDeno) {
    const alias = getInstantAliases();
    res = await _loadConfig(alias ? withDenoAliases(opts, alias) : opts);
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
