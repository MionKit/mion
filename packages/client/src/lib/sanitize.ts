/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, routesCache} from '@mionjs/core';
import type {MionClientRequest} from '../request.ts';

// Params arrays already sanitized. Keyed on the ARRAY, not the subRequest: a prefilled middleFn
// restored from the cache is a shallow clone sharing its params array, and validateParams() then
// call() on one subRequest must not run a transform twice (a first-match `replace` is not
// idempotent). A WeakSet never keeps a params array alive.
const sanitizedParams = new WeakSet<any[]>();

/**
 * Applies each subRequest's declared format transforms (trim / case / replace / stripSeparators)
 * to its params, once, when the client option is on, the server resolved `sanitizeParams` for
 * that route, and it shipped a live formatTransform. Runs BEFORE local pre-validation and
 * serialization, so what the client validates and sends is what the server will see. Never
 * throws: a transform over wrong-shaped input is left for validation to report.
 */
export function sanitizeSubRequests(subRequestIds: string[], req: MionClientRequest<any, any>): void {
  if (!req.options.sanitizeParams) return;
  for (const id of subRequestIds) {
    const subRequest = req.subRequestList[id];
    if (!subRequest || subRequest.isResolved || subRequest.error) continue;
    const params = subRequest.params;
    if (!Array.isArray(params) || sanitizedParams.has(params)) continue;
    // inputFrom placeholders are filled by the server after the source route runs
    if (subRequest.mappings && subRequest.mappings.length > 0) continue;
    if (!routesCache.hasMetadata(id)) continue;
    const method = routesCache.useMethodJitFns(id);
    const formatTransform = method.paramsJitFns.formatTransform;
    if (!method.options?.sanitizeParams || !method.paramsCount || !formatTransform || formatTransform.isNoop) continue;
    // a headersFn's first param is the HeadersSubset, never part of the body params type
    const isHeadersFn = method.type === HandlerType.headersMiddleFn && !!method.headersParam;
    const body = isHeadersFn ? params.slice(1) : params;
    try {
      const sanitized = formatTransform.fn(body) as any[];
      subRequest.params = isHeadersFn ? [params[0], ...sanitized] : sanitized;
      sanitizedParams.add(subRequest.params);
    } catch {
      // validation reports the real error
    }
  }
}
