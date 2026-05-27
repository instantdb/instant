import fs from 'fs-extra';
import path from 'path';
import { Project } from './cli.js';

const envNames: Record<Project['base'], string> = {
  'next-js-app-dir': 'NEXT_PUBLIC_INSTANT_APP_ID',
  'vite-react': 'VITE_INSTANT_APP_ID',
  'vite-vanilla': 'VITE_INSTANT_APP_ID',
  expo: 'EXPO_PUBLIC_INSTANT_APP_ID',
  'tanstack-start': 'VITE_INSTANT_APP_ID',
  'bun-react': 'BUN_PUBLIC_INSTANT_APP_ID',
  'solidjs-vite': 'VITE_INSTANT_APP_ID',
  sveltekit: 'VITE_INSTANT_APP_ID',
  'vue-vite': 'VITE_INSTANT_APP_ID',
  'tanstack-start-with-tanstack-query': 'VITE_INSTANT_APP_ID',
  'vercel-ai-sdk': 'NEXT_PUBLIC_INSTANT_APP_ID',
  'ai-chat': 'NEXT_PUBLIC_INSTANT_APP_ID',
  'python-script': 'INSTANT_APP_ID',
};

export const applyEnvFile = (
  project: Project,
  projectDir: string,
  appId: string,
  adminToken: string,
) => {
  const envPath = path.join(projectDir, '.env');
  const envVarName = envNames[project.base];
  // The Python SDK reads INSTANT_ADMIN_TOKEN; the JS admin SDK reads
  // INSTANT_APP_ADMIN_TOKEN.
  const adminVarName =
    project.base === 'python-script'
      ? 'INSTANT_ADMIN_TOKEN'
      : 'INSTANT_APP_ADMIN_TOKEN';
  const envContent = `${envVarName}=${appId}\n${adminVarName}=${adminToken}`;

  fs.writeFileSync(envPath, envContent);
};
