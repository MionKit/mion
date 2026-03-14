/** Shim for virtual:mion-server-pure-fns used by test-publish tests.
 * Provides an empty cache since server pure functions are only available at runtime. */
export const serverPureFnsCache: Record<string, any> = {};
