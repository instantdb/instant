import { readFile, stat } from "fs/promises";
import JSONC from 'jsonc-parser';

export async function pathExists(f) {
  try {
    await stat(f);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile(path) {
  if (!pathExists(path)) {
    return null;
  }

  try {
    const data = await readFile(path, "utf-8");
    return JSONC.parse(data);
  } catch (error) {}

  return null;
}
