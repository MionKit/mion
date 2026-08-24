/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Minimal Web Storage stand-in for the node test environment.
 *
 *  @mionjs/client already falls back to its own in-memory storage when
 *  `localStorage` is undefined (packages/client/src/lib/storage.ts), so installing a
 *  DOM-storage package would only have covered the fallback path. Defining a real
 *  global here makes the client take its localStorage branch instead — which is the
 *  branch a browser consumer runs, and the one worth proving against the published
 *  package. Kept in the fixture so the lane carries no extra dependency. */
export class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.entries.has(key) ? (this.entries.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
  }
}

/** Installs the stand-in on globalThis. Called from each spec's beforeAll. */
export function installMemoryStorage(): void {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
}
