import { dirname, basename } from "path";
import { findUp } from "find-up";

// TODO: consider a different name: maybe 'repoInfo'? 
export default async function packageDirectory() {
  const p = await findUp(["package.json", "deno.json", "deno.jsonc"]);
  if (!p) return;
  const dirName = dirname(p);
  const packageType = basename(p);
  return {
    dirName,
    filePath: p,
    packageType: packageType === "package.json" ? "package" : "deno",
  };
}
