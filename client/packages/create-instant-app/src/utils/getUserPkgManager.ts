import { Project } from '~/cli.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export const getUserPkgManager: (base: Project['base']) => PackageManager = (
  base,
) => {
  // If bun template selected, use bun for package installation and `run dev` console output
  // since we know they likely have bun installed and want to use it, even if they ran npx
  if (base === 'bun-react') {
    return 'bun';
  }
  const userAgent = process.env.npm_config_user_agent;

  if (userAgent) {
    if (userAgent.startsWith('yarn')) {
      return 'yarn';
    } else if (userAgent.startsWith('pnpm')) {
      return 'pnpm';
    } else if (userAgent.startsWith('bun')) {
      return 'bun';
    } else {
      return 'npm';
    }
  } else {
    // If no user agent is set, assume npm
    return 'npm';
  }
};
