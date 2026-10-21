/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Rides the `#metadata-from-server` chunk: like the fetch, it runs only when the bundle comes up short.

import {RpcError} from '@mionjs/core';
import type {MethodWithOptions, SerializableMethodsData} from '@mionjs/core';
import type {ClientOptions} from '../types.ts';
import {stashApiVersionError} from './apiBuildVersion.ts';
import {getMethod, isBundledMethod} from './methods.ts';
import {installMethodRows} from './clientMethodsMetadata.ts';

/** Ids each baseURL confirmed: a route is checked once per server, on its first use after the mismatch. */
const verifiedIds = new Map<string, Set<string>>();

function verifiedBy(baseURL: string): Set<string> {
  let ids = verifiedIds.get(baseURL);
  if (!ids) verifiedIds.set(baseURL, (ids = new Set()));
  return ids;
}

/** The ids to ask the server to confirm, out of the ones this request calls. */
export function unverifiedIds(baseURL: string, ids: string[]): string[] {
  const verified = verifiedBy(baseURL);
  return ids.filter((id) => !verified.has(id));
}

/** Tests only: forgets which routes were confirmed. */
export function resetApiVersionRecovery(): void {
  verifiedIds.clear();
}

/** A fetched row is a cache: replaced and saved. A bundled one is what the calling code was built against: reported. */
export function verifyMethodRows(options: ClientOptions, asked: string[], data: SerializableMethodsData): void {
  const verified = verifiedBy(options.baseURL);
  for (const id of asked) verified.add(id);
  // Only the asked ids: comparing the middleware riding along would report a route this call never uses.
  const stale = asked.filter((id) => !rowsAgree(getMethod(id), data.methods[id] as MethodWithOptions | undefined));
  if (!stale.length) return;
  const fetched = stale.filter((id) => !isBundledMethod(id));
  if (fetched.length) installMethodRows(data, options, fetched);
  const bundled = stale.filter((id) => isBundledMethod(id));
  if (bundled.length) stashApiVersionError(staleRoutesError(bundled));
}

/** Sync id only: it covers the types and wire formats; a row or id missing on either end never agrees. */
export function rowsAgree(held: MethodWithOptions | undefined, served: MethodWithOptions | undefined): boolean {
  return !!held?.syncId && held.syncId === served?.syncId;
}

function staleRoutesError(stale: string[]): RpcError<'api-version-mismatch'> {
  return new RpcError({
    type: 'api-version-mismatch',
    publicMessage:
      `This mion client carries routes compiled against an older version of the API: the server answers with a ` +
      `different build version, and ${stale.map((id) => `"${id}"`).join(', ')} no longer matches what it declares. ` +
      `Reload the app or rebuild the client against the current API.`,
  });
}
