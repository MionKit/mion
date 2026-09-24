/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

/** Stores singleton state on globalThis so it survives dual module loading (CJS + ESM copies).
 *  Defense in depth: noExternal is the primary mechanism, this marks the binding as process-wide. */
export function getOrCreateGlobal<T>(key: string, factory: () => T): T {
  const sym = Symbol.for(key);
  return ((globalThis as any)[sym] ??= factory()) as T;
}

/** Random UUID V7 (RFC 9562). Randomness comes from crypto.randomUUID(), a native binding that
 *  batches entropy, so it may beat allocating typed arrays through crypto.getRandomValues. */
export function randomUUID_V7(): string {
  const uuid = crypto.randomUUID();
  const tHex = Date.now().toString(16).padStart(12, '0');
  return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
}

/** Browser-safe: returns undefined where `process` is not available. */
export function getENV(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

// ############# Base64 URL #############

/** Encodes a string to URL-safe base64 (RFC 4648 §5) without padding */
export function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Route ids are object keys and client proxy methods, so this is wider than the data-key `reflection.UnsafePropertyNames`. */
export function isUnsafePropertyName(name: string): boolean {
  // length first, so a name of any other length costs one integer compare and no string compare
  const length = name.length;
  if (length === 9) return name === '__proto__' || name === 'prototype';
  if (length === 11) return name === 'constructor';
  return false;
}

/** Decodes a URL-safe base64 string (RFC 4648 §5) back to a string */
export function fromBase64Url(encoded: string): string {
  return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
}

let isTest: boolean | undefined = undefined;

export function isTestEnv() {
  if (isTest !== undefined) return isTest;
  isTest = getENV('VITEST') !== undefined || getENV('NODE_ENV') === 'test';
  return isTest;
}
