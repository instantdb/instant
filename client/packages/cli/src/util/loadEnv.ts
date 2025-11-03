import dotenvFlow from 'dotenv-flow';

export const loadEnv = () => {
  const envIndex = process.argv.indexOf('--env');
  const envFile = envIndex !== -1 ? process.argv[envIndex + 1] : undefined;

  dotenvFlow.config({
    silent: true,
    files: envFile ? [envFile] : undefined,
  });
};
