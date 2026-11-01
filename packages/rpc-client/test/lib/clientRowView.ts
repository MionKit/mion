/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodMetadata, MethodWithOptions, RemoteMethodOpts} from '@mionjs/core';

/** Every row field a client acts on, normalised so parity tests compare a bundled row with the server's. */
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
    addedOptions: addedOptionsOf(row.options),
  };
}

// typed against core's option keys, so a key mion adds later is a compile error here, not a silent "added" option
const MION_OPTION_KEYS = new Set(
  Object.keys({alwaysRun: 1, description: 1, parser: 1, isMutation: 1, sanitizeParams: 1, maxBodySize: 1} satisfies Record<
    keyof RemoteMethodOpts,
    1
  >)
);

/** The keys a `customMionRouter` `handler` part added, so parity sees one missing from a bundled row. */
function addedOptionsOf(options: MethodWithOptions['options'] | undefined) {
  const added = Object.entries(options ?? {}).filter(([key]) => !MION_OPTION_KEYS.has(key));
  return added.length ? Object.fromEntries(added) : undefined;
}

function headersView(headers: MethodMetadata['headersParam'] | null | undefined) {
  if (!headers) return undefined;
  return {headerNames: headers.headerNames, jitHash: headers.jitHash};
}
