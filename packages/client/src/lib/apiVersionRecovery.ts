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

/** Ids each server (baseURL) has confirmed: each route is checked once per server, on its first use after the mismatch. */
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

/** Compares every field the build version hashes, `options` included: this side holds both full rows. */
/** Under `syncRoutes` (`keepTypeChanges`) a row whose types changed is kept: replacing it would make its sync id
 *  match the server's while this client's code still expects the old types, so the call must be refused instead. */
export function verifyMethodRows(baseURL: string, asked: string[], data: SerializableMethodsData, keepTypeChanges = false): void {
  const verified = verifiedBy(baseURL);
  for (const id of asked) verified.add(id);
  // Only the asked ids: comparing the middleware riding along would report a route this call never uses.
  const stale = asked.filter((id) => !rowsAgree(getMethod(id), data.methods[id] as MethodWithOptions | undefined));
  const replaced = keepTypeChanges ? stale.filter((id) => sameTypes(getMethod(id), data.methods[id])) : stale;
  if (!replaced.length) return;
  // The bundled shelf wins over the fetched one, so the rows it replaces have to go first
  dropBundledMethods(replaced);
  installMethodRows(data, replaced);
  stashApiVersionError(staleRoutesError(replaced));
}

function sameTypes(held: MethodWithOptions | undefined, served: MethodWithOptions | undefined): boolean {
  if (!held || !served) return false;
  return (
    held.paramsJitHash === served.paramsJitHash &&
    held.returnJitHash === served.returnJitHash &&
    held.headersParam?.jitHash === served.headersParam?.jitHash
  );
}

/** A row missing on either end counts as a difference: the bundle never had it, or the server dropped it. */
function rowsAgree(bundled: MethodWithOptions | undefined, served: MethodWithOptions | undefined): boolean {
  if (!bundled || !served) return false;
  return (
    bundled.type === served.type &&
    bundled.isAsync === served.isAsync &&
    bundled.hasReturnData === served.hasReturnData &&
    bundled.paramsJitHash === served.paramsJitHash &&
    bundled.returnJitHash === served.returnJitHash &&
    bundled.paramsCount === served.paramsCount &&
    bundled.headersParam?.jitHash === served.headersParam?.jitHash &&
    bundled.headersReturn?.jitHash === served.headersReturn?.jitHash &&
    same(bundled.paramNames, served.paramNames) &&
    same(bundled.middlewareIds, served.middlewareIds) &&
    optionsAgree(bundled.options, served.options)
  );
}

/** Ordered lists on both ends, so a plain stringify compares them. */
function same(bundled: unknown, served: unknown): boolean {
  return bundled === served || JSON.stringify(bundled) === JSON.stringify(served);
}

/** The options a client acts on: the server fills in the rest, so comparing those reports a false difference. */
const COMPARED_OPTIONS = ['isMutation', 'parser', 'validateParams', 'validateReturn'] as const;

type ComparedOptions = Partial<Pick<MethodWithOptions['options'], (typeof COMPARED_OPTIONS)[number]>>;

function optionsAgree(bundled: ComparedOptions | undefined, served: ComparedOptions | undefined): boolean {
  return COMPARED_OPTIONS.every((name) => same(parserShape(bundled?.[name]), parserShape(served?.[name])));
}

/** `parser` is written either as one name or as a name per direction, so both spellings compare alike. */
function parserShape(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return {params: value, return: value};
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
