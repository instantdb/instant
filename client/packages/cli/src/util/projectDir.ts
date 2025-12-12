import { packageDirectory } from 'package-directory';
import { findUp } from 'find-up-simple';
import path from 'path';

export type ProjectType = 'node' | 'deno';

export interface ProjectInfo {
  dir: string;
  type: ProjectType;
}

export async function findProjectDir(
  cwd?: string,
): Promise<ProjectInfo | null> {
  // Check for Deno first. A Deno project may also have a package.json (for npm
  // compatibility), but if deno.json exists, the user intends to use Deno and
  // we should use Deno-specific behavior (e.g., resolving @instantdb/* from
  // CLI's dependencies instead of node_modules).
  const denoConfig =
    (await findUp('deno.json', { cwd })) ||
    (await findUp('deno.jsonc', { cwd }));
  if (denoConfig) {
    return { dir: path.dirname(denoConfig), type: 'deno' };
  }

  // Fall back to package-directory for Node
  const nodeDir = await packageDirectory({ cwd });
  if (nodeDir) {
    return { dir: nodeDir, type: 'node' };
  }

  return null;
}
