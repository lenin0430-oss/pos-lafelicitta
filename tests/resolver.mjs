import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) { const f = RAIZ + specifier.slice(2) + ext; if (existsSync(f)) return nextResolve(pathToFileURL(f).href, context); }
  }
  try { return await nextResolve(specifier, context); }
  catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.\w+$/.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    if (e.code === "ERR_MODULE_NOT_FOUND" && /^next\/[\w/-]+$/.test(specifier)) return nextResolve(specifier + ".js", context);
    throw e;
  }
}
