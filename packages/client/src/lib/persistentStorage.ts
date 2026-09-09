/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Asks the browser to keep the metadata cache when it starts clearing storage to reclaim space.
 *  Call it from your own code, ideally after a user action: some browsers show a permission bar for
 *  this, so mion never calls it on your behalf unless the permission is already granted.
 *  Resolves false where the browser has no such notion. */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/** The automatic half, run once after the cache's first successful write.
 *
 *  mion NEVER triggers a browser prompt of any kind. Some browsers show a permission bar when a page
 *  calls `persist()`, and there is no way to know in advance which will, so the only state this asks
 *  from is `granted`: the browser has already decided, and the call cannot prompt. Every other state,
 *  and every browser with no permissions API, is left alone and the cache is simply evictable there.
 *  An app that wants more calls `requestPersistentStorage()` itself. */
export async function requestPersistenceWhenSilent(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist || !storage.persisted) return false;
  try {
    if (await storage.persisted()) return true;
    const permissions = globalThis.navigator?.permissions;
    if (!permissions?.query) return false;
    const status = await permissions.query({name: 'persistent-storage' as PermissionName});
    if (status.state !== 'granted') return false;
    return await storage.persist();
  } catch {
    // an unsupported permission name rejects; that is a browser we do not ask in
    return false;
  }
}
