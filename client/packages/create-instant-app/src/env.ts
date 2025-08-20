import fs from 'fs-extra';
import path from 'path';
import { CliResults } from './cli.js';

const envNames: Record<CliResults['base'], string> = {
  'next-js-app-dir': 'NEXT_PUBLIC_INSTANT_APP_ID',
  'vite-vanilla': 'VITE_INSTANT_APP_ID',
  expo: 'EXPO_PUBLIC_INSTANT_APP_ID',
};

export const applyEnvFile = (
  project: CliResults,
  projectDir: string,
  appId: string,
) => {
  const envPath = path.join(projectDir, '.env');
  const envVarName = envNames[project.base];
  const envContent = `${envVarName}=${appId}\n`;

  fs.writeFileSync(envPath, envContent);
};
