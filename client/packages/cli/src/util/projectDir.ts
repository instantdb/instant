import { packageDirectory } from 'package-directory';
import { findUp } from 'find-up-simple';
import path from 'node:path';

export type ProjectType = 'node' | 'deno' | 'python';

export interface ProjectInfo {
  dir: string;
  type: ProjectType;
}

// Same-directory tie-breaker: Deno > Python > Node. Deno may coexist
// with package.json for npm interop; pyproject.toml signals Python.
const TYPE_PRIORITY: Record<ProjectType, number> = {
  deno: 0,
  python: 1,
  node: 2,
};

const depth = (filepath: string) => filepath.split(path.sep).length;

export async function findProjectDir(
  cwd?: string,
): Promise<ProjectInfo | null> {
  const [denoJson, denoJsonc, pyproject, nodeDir] = await Promise.all([
    findUp('deno.json', { cwd }),
    findUp('deno.jsonc', { cwd }),
    findUp('pyproject.toml', { cwd }),
    packageDirectory({ cwd }),
  ]);

  // Push deno.json and deno.jsonc independently so the depth-sort can
  // pick the nearer one when both exist at different levels.
  const candidates: { file: string; type: ProjectType }[] = [];
  if (denoJson) candidates.push({ file: denoJson, type: 'deno' });
  if (denoJsonc) candidates.push({ file: denoJsonc, type: 'deno' });
  if (pyproject) candidates.push({ file: pyproject, type: 'python' });
  if (nodeDir) {
    candidates.push({ file: path.join(nodeDir, 'package.json'), type: 'node' });
  }

  if (candidates.length === 0) return null;

  // Nearest marker wins (deepest path), so a Python project nested in a
  // Node monorepo isn't misclassified by a parent's package.json.
  candidates.sort((a, b) => {
    const depthDiff = depth(b.file) - depth(a.file);
    return depthDiff !== 0
      ? depthDiff
      : TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });

  return { dir: path.dirname(candidates[0].file), type: candidates[0].type };
}
