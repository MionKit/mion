import { resolve } from "path/posix";
import { fileURLToPath } from "url";
async function resolveModule(moduleName, callerDir) {
  const resolvedPath = moduleName.startsWith(".") && callerDir ? resolve(callerDir, moduleName) : moduleName;
  const metaResolve = getImportMetaResolve();
  if (metaResolve) {
    const resolved = await metaResolve(resolvedPath);
    if (resolved) return resolved.startsWith("file:") ? fileURLToPath(resolved) : resolved;
  }
  try {
    if (typeof require !== "undefined" && typeof require.resolve === "function") return require.resolve(resolvedPath);
  } catch {
  }
  try {
    const { createRequire } = await import("module");
    const basePath = callerDir ? resolve(callerDir, "noop.js") : resolve(process.cwd(), "noop.js");
    const requireFn = createRequire(basePath);
    return requireFn.resolve(resolvedPath);
  } catch (err) {
    throw new Error(`Failed to resolve module "${moduleName}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
function getImportMetaResolve() {
  try {
    return new Function("specifier", "return import.meta.resolve?.(specifier);");
  } catch {
    return void 0;
  }
}
export {
  resolveModule
};
//# sourceMappingURL=resolveModule.js.map
