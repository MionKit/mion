/** Shim for mion virtual modules — provides empty caches when running outside the mion Vite plugin (e.g. Next.js/Turbopack). */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
export const serverPureFnsCache = {};
