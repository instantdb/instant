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
  // Check for Deno first (more specific - if they have deno.json, they want Deno)
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
