/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const STORAGE_GLOBAL_KEY = '__mion_storage__';

/** In-memory Storage implementation for SSR/Node environments where localStorage is not available */
export class MemoryStorage {
    private data = new Map<string, string>();
    get length() {
        return this.data.size;
    }
    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string) {
        this.data.set(key, value);
    }
    removeItem(key: string) {
        this.data.delete(key);
    }
    clear() {
        this.data.clear();
    }
    key(index: number): string | null {
        return [...this.data.keys()][index] ?? null;
    }
}

/** Returns localStorage if available, otherwise a MemoryStorage instance.
 * Uses globalThis to ensure the same instance is shared across module boundaries. */
export function getStorage(): Storage | MemoryStorage {
    const existing = (globalThis as any)[STORAGE_GLOBAL_KEY];
    if (existing) return existing;
    let storage: Storage | MemoryStorage;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('__mion_test__', '1');
            localStorage.removeItem('__mion_test__');
            storage = localStorage;
        } else {
            storage = new MemoryStorage();
        }
    } catch {
        storage = new MemoryStorage();
    }
    (globalThis as any)[STORAGE_GLOBAL_KEY] = storage;
    return storage;
}

/** Reset storage instance, useful for testing */
export function resetStorageInstance() {
    delete (globalThis as any)[STORAGE_GLOBAL_KEY];
}
