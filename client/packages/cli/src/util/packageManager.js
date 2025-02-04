// Note:
// Extracted the main logic for `detectPackageManager` from:
// https://github.com/vercel/vercel/blob/eb7fe8a9266563cfeaf275cd77cd9fad3f17c92b/packages/build-utils/src/fs/run-user-scripts.ts

import { pathExists, readJsonFile } from './fs.js';
import path from 'path';

async function detectPackageManager(destPath) {
  const lockfileNames = {
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lockb': 'bun',
  };

  for (const dir of traverseUpDirectories(destPath)) {
    for (const [lockfileName, cliType] of Object.entries(lockfileNames)) {
      const lockfilePath = path.join(dir, lockfileName);
      if (await pathExists(lockfilePath)) {
        return cliType;
      }
    }

    const packageJsonPath = path.join(dir, 'package.json');
    if (await pathExists(packageJsonPath)) {
      const packageJson = await readJsonFile(packageJsonPath);
      if (packageJson.packageManager) {
        const corepackPackageManager = parsePackageManagerField(
          packageJson.packageManager,
        );
        if (corepackPackageManager) {
          return corepackPackageManager.packageName;
        }
      }
    }

    if (dir === path.parse(dir).root) {
      break;
    }
  }

  return 'npm';
}

function* traverseUpDirectories(start) {
  let current = path.resolve(start);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

function parsePackageManagerField(packageManager) {
  if (!packageManager) return null;
  const atIndex = packageManager.lastIndexOf('@');
  if (atIndex <= 0) return null; // '@' at position 0 is invalid
  const packageName = packageManager.slice(0, atIndex);
  const packageVersion = packageManager.slice(atIndex + 1);
  if (!packageName || !packageVersion) {
    return null;
  }
  return { packageName, packageVersion };
}

function getInstallCommand(packageManager, moduleName) {
  if (packageManager === 'npm') {
    return `npm install ${moduleName}`;
  } else {
    return `${packageManager} add ${moduleName}`;
  }
}

export { detectPackageManager, getInstallCommand };
