import { PathLike } from 'fs';
import { readFile, stat } from 'fs/promises';

export async function pathExists(p: PathLike): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = Record<string, any>>(
  p: PathLike,
): Promise<T | null> {
  if (!pathExists(p)) {
    return null;
  }

  try {
    const data = await readFile(p, 'utf-8');
    return JSON.parse(data);
  } catch (error) {}

  return null;
}
