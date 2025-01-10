import { dirname, basename } from "path";
import { findUp } from "find-up";

export default async function packageDirectory() {
  const p = await findUp(["package.json", "deno.json", "deno.jsonc"]);
  if (!p) return;
  const dirName = dirname(p);
  const baseName = basename(p);
  return {
    dirName,
    baseName,
    fullPath: p,
    packageType: baseName === "package.json" ? "package" : "deno",
  };
}
