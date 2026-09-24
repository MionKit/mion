/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Rides the `#metadata-from-server` chunk: like the fetch, it runs only when the bundle comes up short.

import {RpcError, MION_ROUTES} from '@mionjs/core';
import type {MethodWithOptions, SerializableMethodsData} from '@mionjs/core';
import type {SubRequest} from '../types.ts';
import {stashApiVersionError} from './apiBuildVersion.ts';
import {dropBundledMethods, getMethod} from './methods.ts';
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

/** Rides a request the client was making anyway, so a mismatch costs no round trip.
 *  The server answers unfiltered: only this side holds both rows, so only it can compare. */
export function createVerifySubRequest(methodIds: string[]): SubRequest<any> {
  return {
    pointer: [MION_ROUTES.methodsMetadata],
    id: MION_ROUTES.methodsMetadata,
    isResolved: false,
    params: [methodIds],
  } as SubRequest<any>;
}

/** Compares each asked route's `syncId` with the server's: this side holds both rows. */
export function verifyMethodRows(baseURL: string, asked: string[], data: SerializableMethodsData): void {
  const verified = verifiedBy(baseURL);
  for (const id of asked) verified.add(id);
  // Only the asked ids: comparing the middleware riding along would report a route this call never uses.
  const stale = asked.filter((id) => !rowsAgree(getMethod(id), data.methods[id] as MethodWithOptions | undefined));
  if (!stale.length) return;
  // The bundled shelf wins over the fetched one, so the rows it replaces have to go first
  dropBundledMethods(stale);
  installMethodRows(data, stale);
  stashApiVersionError(staleRoutesError(stale));
}

/** The sync id alone decides: it covers the types and the wire format, all a safe call depends on.
 *  A row or id missing on either end counts as a difference: the bundle never had it, or the server dropped it. */
export function rowsAgree(held: MethodWithOptions | undefined, served: MethodWithOptions | undefined): boolean {
  return !!held?.syncId && held.syncId === served?.syncId;
}

function staleRoutesError(stale: string[]): RpcError<'api-version-mismatch'> {
  return new RpcError({
    type: 'api-version-mismatch',
    publicMessage:
      `This mion client carries routes compiled against an older version of the API: the server answers with a ` +
      `different build version, and ${stale.map((id) => `"${id}"`).join(', ')} no longer matches what it declares. ` +
      `The client replaced them with the server's own. Rebuild the client against the current API.`,
  });
}
