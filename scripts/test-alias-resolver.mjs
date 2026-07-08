/**
 * Module-resolution hook mapping the tsconfig "@/*" alias to the project root
 * for `npm test` (see test-loader.mjs). Mirrors the bundler's resolution for
 * the extensionless imports the codebase uses: try `.ts`, `.tsx`, then a
 * directory's `index.ts`. Only value imports reach this at runtime — `import
 * type` lines are erased by Node's type stripping. Note .tsx files resolved
 * here would still fail to LOAD (type stripping has no JSX support); tested
 * module graphs must stay JSX-free, which the framework-free lib/ modules are.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUFFIXES = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    for (const suffix of ["", ...SUFFIXES]) {
      const candidate = base + suffix;
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
