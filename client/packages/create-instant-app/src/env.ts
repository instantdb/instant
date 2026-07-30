import fs from 'fs-extra';
import path from 'path';
import { projectBaseConfig, type ProjectBase } from './projectBase.js';

export const applyEnvFile = (
  base: ProjectBase,
  projectDir: string,
  appId: string,
  adminToken: string,
) => {
  const envPath = path.join(projectDir, '.env');
  const envVarName = projectBaseConfig[base].appIdEnvName;
  const envContent = `${envVarName}=${appId}\nINSTANT_APP_ADMIN_TOKEN=${adminToken}`;

  fs.writeFileSync(envPath, envContent);
};
