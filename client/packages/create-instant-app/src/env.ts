import fs from 'fs-extra';
import path from 'path';
import { Project } from './cli.js';

const envNames: Record<Project['base'], string> = {
  'next-js-app-dir': 'NEXT_PUBLIC_INSTANT_APP_ID',
  'vite-vanilla': 'VITE_INSTANT_APP_ID',
  expo: 'EXPO_PUBLIC_INSTANT_APP_ID',
  'tanstack-start': 'VITE_INSTANT_APP_ID',
};

export const applyEnvFile = (
  project: Project,
  projectDir: string,
  appId: string,
  adminToken: string,
) => {
  const envPath = path.join(projectDir, '.env');
  const envVarName = envNames[project.base];
  const envContent = `${envVarName}=${appId}\nINSTANT_APP_ADMIN_TOKEN=${adminToken}`;

  fs.writeFileSync(envPath, envContent);
};
