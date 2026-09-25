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

/** The automatic half, run once after the cache's first successful write. mion NEVER triggers a browser
 *  prompt: `persist()` can show a permission bar and no one can tell in advance which browser will, so this
 *  asks only from `granted`. Anywhere else the cache is simply evictable, until an app asks for itself. */
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
