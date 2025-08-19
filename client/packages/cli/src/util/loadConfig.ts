import {
  loadConfig as _loadConfig,
  LoadConfigOptions,
  LoadConfigResult,
} from 'unconfig';

export async function loadConfig<T>(
  opts: LoadConfigOptions<T>,
): Promise<LoadConfigResult<T>> {
  const res = await _loadConfig(opts);
  // Unconfig seems to add an __esModule property to the config object
  // Removing it.
  if (typeof res.config === 'object' && '__esModule' in res.config) {
    delete res.config.__esModule;
  }
  return res;
}
