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

/** Ids the server has confirmed: each route is checked once, on its first use after the mismatch. */
const verifiedIds = new Set<string>();

/** The ids to ask the server to confirm, out of the ones this request calls. */
export function unverifiedIds(ids: string[]): string[] {
  return ids.filter((id) => !verifiedIds.has(id));
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
export function verifyMethodRows(asked: string[], data: SerializableMethodsData): void {
  for (const id of asked) verifiedIds.add(id);
  // Only the ids asked for: their middlewares ride along, and comparing those would report a route this call never uses.
  const stale = asked.filter((id) => !rowsAgree(getMethod(id), data.methods[id] as MethodWithOptions | undefined));
  if (!stale.length) return;
  // The bundled shelf wins over the fetched one, so the rows it replaces have to go first
  dropBundledMethods(stale);
  installMethodRows(data);
  stashApiVersionError(staleRoutesError(stale));
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
