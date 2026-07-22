import { loadConfig } from './loadConfig.ts';

export type InstantConfig = {
  apiURI?: string;
  apps?: Record<string, { id: string }>;
};

export async function readInstantConfigFile() {
  return (
    await loadConfig<InstantConfig>({
      sources: [
        {
          files: 'instant.config',
          extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'],
        },
      ],
      merge: false,
    })
  ).config;
}
