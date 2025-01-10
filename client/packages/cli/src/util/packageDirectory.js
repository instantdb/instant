import { dirname, basename } from "path";
import { findUp } from "find-up";

export default async function packageDirectory() {
  const p = await findUp(["package.json", "deno.json"]);
  if (!p) return;
  const dirName = dirname(p);
  const packageType = basename(p);
  return { 
    dirName, 
    packageType,
  }
}
