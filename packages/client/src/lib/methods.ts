/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithOptions, MethodWithOptsAndJitFns} from '@mionjs/core';

// Where the request path looks a method up, and the ONLY table it knows. Two shelves that never
// share a key: the bundle's own rows, and the fetched lane's (core's routesCache) once that lane
// has loaded. Keeping them apart is what lets a `bundled` client leave the routes cache, its hash
// lookup and its hydration merge out of the bundle entirely, and what stops a fetched or restored
// row ever landing on an id the build compiled.

/** What the fetched lane answers with; `routesCache` implements it as-is. */
export interface FetchedMethods {
  hasMetadata(id: string): boolean;
  getMetadata(id: string): MethodWithOptions | undefined;
  useMethodJitFns(id: string): MethodWithOptsAndJitFns;
}

const bundledMethods = new Map<string, MethodWithOptsAndJitFns>();
let fetchedMethods: FetchedMethods | undefined;

/** True when either shelf can answer for the id. */
export function hasMethod(id: string): boolean {
  return bundledMethods.has(id) || fetchedMethods?.hasMetadata(id) === true;
}

/** The method's row, or undefined when neither shelf holds it. */
export function getMethod(id: string): MethodWithOptions | undefined {
  return bundledMethods.get(id) ?? fetchedMethods?.getMetadata(id);
}

/** The method's row with its compiled functions; throws when neither shelf holds it, the way
 *  `routesCache.useMethodJitFns` always has. A bundled row already carries them. */
export function useMethodFns(id: string): MethodWithOptsAndJitFns {
  const bundled = bundledMethods.get(id);
  if (bundled) return bundled;
  const fetched = fetchedMethods?.useMethodJitFns(id);
  if (!fetched) throw new Error(`Metadata for remote method ${id} not found`);
  return fetched;
}

/** Puts a build-compiled method on the bundled shelf. Only `registerBundledApi` calls this. */
export function setBundledMethod(id: string, entry: MethodWithOptsAndJitFns): void {
  bundledMethods.set(id, entry);
}

/** True when the method's row came from the bundle rather than the server. */
export function isBundledMethod(id: string): boolean {
  return bundledMethods.has(id);
}

/** Every id the bundle carries. Tests only. */
export function bundledMethodIds(): string[] {
  return [...bundledMethods.keys()];
}

/** Hands the fetched lane's table over, once, as that lane loads. */
export function setFetchedMethods(methods: FetchedMethods): void {
  fetchedMethods = methods;
}

/** Empties the bundled shelf. Only for testing — the fetched shelf is left wired, because the
 *  lane module is only evaluated once and would never hand its table over again. */
export function resetBundledMethods(): void {
  bundledMethods.clear();
}
