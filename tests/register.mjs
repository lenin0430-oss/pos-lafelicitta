// Permite que node --test importe los .ts de lib/ con imports sin extensión (como Next/TypeScript).
import { register } from "node:module";
register("./resolver.mjs", import.meta.url);
