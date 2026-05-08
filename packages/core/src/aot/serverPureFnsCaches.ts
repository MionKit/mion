/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Server pure functions cache.
 * Backed by a globalThis slot so all module instances share the same cache.
 *
 * This is critical when @mionjs/router is externalised by Vite SSR: Node loads
 * the router via its own resolver (cache bucket A) while the plugin's ssrLoadModule
 * may produce a different instance (cache bucket B). Without globalThis, routesFlow
 * (instance B) would read a different `serverPureFnsCache` than what the plugin populated.
 *
 * Build mode: the mion vite plugin redirects this module to `virtual:mion-server-pure-fns`,
 * which inlines the populated entries and writes them into the same globalThis slot at
 * bundle init. Runtime reads from the slot and finds the populated cache.
 */
const KEY = Symbol.for('mion.server-pure-fns/v1');
const serverPureFnsCache: Record<string, Record<string, any>> = ((globalThis as any)[KEY] ??= {});

/** Look up a server pure function by namespace and hash. Always reads the current globalThis slot. */
export function getServerPureFn(namespace: string, hash: string): any {
    return serverPureFnsCache[namespace]?.[hash];
}

/**
 * Merges new pure-fn entries into the cache. Called by the mion Vite plugin in dev,
 * and by the auto-generated virtual module at bundle init in build mode.
 */
export function loadServerPureFns(entries: Record<string, Record<string, any>>): void {
    for (const ns in entries) {
        serverPureFnsCache[ns] = {...(serverPureFnsCache[ns] || {}), ...entries[ns]};
    }
}
