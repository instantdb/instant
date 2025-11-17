import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

type ConfigCandidate = {
  files: string;
  extensions: string[];
  transform: (code: string) => string;
};

function transformImports(code: string): string {
  return code.replace(
    /["']@instantdb\/react-native["']/g,
    '"@instantdb/react-native/dist/cli"',
  );
}

function findPathsRecursive(
  baseDir: string,
  maxDepth: number,
  fileName: string,
): string[] {
  const paths: string[] = [];
  const cwd = process.cwd();

  const scanDir = (currentDir: string, currentDepth: number): void => {
    if (currentDepth > maxDepth) return;

    const fullPath = join(cwd, currentDir);
    if (!existsSync(fullPath)) return;

    paths.push(join(currentDir, fileName));

    if (currentDepth < maxDepth) {
      try {
        const entries = readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules'
          ) {
            scanDir(join(currentDir, entry.name), currentDepth + 1);
          }
        }
      } catch (err) {}
    }
  };

  scanDir(baseDir, 0);
  return paths;
}

function getEnvSchemaPathWithLogging(): string | undefined {
  const path = process.env.INSTANT_SCHEMA_FILE_PATH;
  if (path) {
    console.log(
      `Using INSTANT_SCHEMA_FILE_PATH=${chalk.green(process.env.INSTANT_SCHEMA_FILE_PATH)}`,
    );
  }
  return path;
}

function getEnvPermsPathWithLogging(): string | undefined {
  const path = process.env.INSTANT_PERMS_FILE_PATH;
  if (path) {
    console.log(
      `Using INSTANT_PERMS_FILE_PATH=${chalk.green(process.env.INSTANT_PERMS_FILE_PATH)}`,
    );
  }
  return path;
}

export function getSchemaReadCandidates(): ConfigCandidate[] {
  const existing = getEnvSchemaPathWithLogging();
  const extensions = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];
  if (existing)
    return [{ files: existing, extensions, transform: transformImports }];

  const candidates: ConfigCandidate[] = [];

  candidates.push({
    files: 'instant.schema',
    extensions,
    transform: transformImports,
  });

  const srcPaths = findPathsRecursive('src', 3, 'instant.schema');
  for (const srcPath of srcPaths) {
    candidates.push({
      files: srcPath,
      extensions,
      transform: transformImports,
    });
  }

  const libPaths = findPathsRecursive('lib', 2, 'instant.schema');
  for (const libPath of libPaths) {
    candidates.push({
      files: libPath,
      extensions,
      transform: transformImports,
    });
  }

  candidates.push({
    files: 'app/instant.schema',
    extensions,
    transform: transformImports,
  });

  return candidates;
}

export function getPermsReadCandidates(): ConfigCandidate[] {
  const existing = getEnvPermsPathWithLogging();
  const extensions = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];
  if (existing)
    return [{ files: existing, extensions, transform: transformImports }];

  const candidates: ConfigCandidate[] = [];

  candidates.push({
    files: 'instant.perms',
    extensions,
    transform: transformImports,
  });

  const srcPaths = findPathsRecursive('src', 3, 'instant.perms');
  for (const srcPath of srcPaths) {
    candidates.push({
      files: srcPath,
      extensions,
      transform: transformImports,
    });
  }

  const libPaths = findPathsRecursive('lib', 2, 'instant.perms');
  for (const libPath of libPaths) {
    candidates.push({
      files: libPath,
      extensions,
      transform: transformImports,
    });
  }

  candidates.push({
    files: 'app/instant.perms',
    extensions,
    transform: transformImports,
  });

  return candidates;
}

export function getSchemaPathToWrite(existingPath?: string): string {
  if (existingPath) return existingPath;
  if (process.env.INSTANT_SCHEMA_FILE_PATH) {
    return process.env.INSTANT_SCHEMA_FILE_PATH;
  }
  if (existsSync(join(process.cwd(), 'src'))) {
    return join('src', 'instant.schema.ts');
  }

  return 'instant.schema.ts';
}

export function getPermsPathToWrite(existingPath?: string): string {
  if (existingPath) return existingPath;
  if (process.env.INSTANT_PERMS_FILE_PATH) {
    return process.env.INSTANT_PERMS_FILE_PATH;
  }
  if (existsSync(join(process.cwd(), 'src'))) {
    return join('src', 'instant.perms.ts');
  }
  return 'instant.perms.ts';
}
