/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Kept out of the eager client chunk: only version recovery and the parity tests read this.

import type {MethodMetadata, MethodWithOptions} from './types/method.types.ts';

/** Every row field a client acts on, normalised so both ends compare alike; only `syncId` blocks a call. */
export function clientRowView(row: MethodWithOptions) {
  const parser = row.options?.parser as unknown;
  return {
    type: row.type,
    paramsJitHash: row.paramsJitHash,
    returnJitHash: row.returnJitHash,
    syncId: row.syncId,
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
