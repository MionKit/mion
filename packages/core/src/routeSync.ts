/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The one sync id definition both ends hash: the server over its executables, the client over its rows.
// What else a client reads off a row is in clientRowView.ts.

import type {MethodMetadata} from './types/method.types.ts';

/** The fields a route's sync id is made of: a method's id and the type ids of what it takes and returns. */
export type RouteSyncFields = Pick<MethodMetadata, 'id' | 'paramsJitHash' | 'returnJitHash' | 'middlewareIds'> & {
  headersParam?: {jitHash: string};
};

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The id of a route and its chain, or undefined when a chain member is unknown; `getRow` answers a middleware's row. */
export function routeSyncId(route: RouteSyncFields, getRow: (id: string) => RouteSyncFields | undefined): string | undefined {
  let input = syncPart(route);
  const middlewareIds = route.middlewareIds;
  if (middlewareIds) {
    for (let i = 0; i < middlewareIds.length; i++) {
      const row = getRow(middlewareIds[i]);
      if (!row) return undefined;
      input += '|' + syncPart(row);
    }
  }
  return toSyncId(fnv1a32(input));
}

function syncPart(row: RouteSyncFields): string {
  return `${row.id}:${row.paramsJitHash}:${row.returnJitHash}:${row.headersParam?.jitHash ?? ''}`;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 32 bits in 6 base64url chars, lowest bits first. */
function toSyncId(hash: number): string {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += BASE64URL[hash & 63];
    hash >>>= 6;
  }
  return id;
}
