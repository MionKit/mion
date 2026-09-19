/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithOptions, MethodWithOptsAndJitFns} from '@mionjs/core';

// The only method table the request path knows: the bundle's own rows, and the fetched lane's
// (core's routesCache) once that lane loads. Keeping them apart leaves the routes cache out of a
// bundled build, and stops a fetched or restored row ever landing on an id the build compiled.

/** What the fetched lane answers with; `routesCache` implements it as-is. */
export interface FetchedMethods {
  hasMetadata(id: string): boolean;
  getMetadata(id: string): MethodWithOptions | undefined;
  useMethodJitFns(id: string): MethodWithOptsAndJitFns;
}

const bundledMethods = new Map<string, MethodWithOptsAndJitFns>();
let fetchedMethods: FetchedMethods | undefined;

export function hasMethod(id: string): boolean {
  return bundledMethods.has(id) || fetchedMethods?.hasMetadata(id) === true;
}

export function getMethod(id: string): MethodWithOptions | undefined {
  return bundledMethods.get(id) ?? fetchedMethods?.getMetadata(id);
}

/** Row plus compiled functions; throws when neither shelf holds it, as `routesCache.useMethodJitFns` does. */
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

/** Empties the bundled shelf. Tests only: the fetched shelf stays wired, the lane module evaluates once. */
export function resetBundledMethods(): void {
  bundledMethods.clear();
}
