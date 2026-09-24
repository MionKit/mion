/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Apart from routeSync.ts, which every client loads: only the version recovery and the parity tests read this.

import type {MethodMetadata, MethodWithOptions} from './types/method.types.ts';

/** Every row field a client acts on (only the sync id fields ever block a call), normalised so both ends compare alike:
 *  `null` reads as `undefined`, an empty `middlewareIds` as absent, a missing `paramsCount` as 0, and a single `parser`
 *  name as the same name for both directions. */
export function clientRowView(row: MethodWithOptions) {
  const parser = row.options?.parser as unknown;
  return {
    type: row.type,
    paramsJitHash: row.paramsJitHash,
    returnJitHash: row.returnJitHash,
    paramsCount: row.paramsCount ?? 0,
    hasReturnData: row.hasReturnData,
    headersParam: headersView(row.headersParam),
    headersReturn: headersView(row.headersReturn),
    middlewareIds: row.middlewareIds?.length ? row.middlewareIds : undefined,
    parser: typeof parser === 'string' ? {params: parser, return: parser} : (parser ?? undefined),
    isMutation: row.options?.isMutation ?? undefined,
    sanitizeParams: row.options?.sanitizeParams ?? undefined,
  };
}

function headersView(headers: MethodMetadata['headersParam'] | null | undefined) {
  if (!headers) return undefined;
  return {headerNames: headers.headerNames, jitHash: headers.jitHash};
}
