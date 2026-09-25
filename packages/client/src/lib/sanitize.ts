/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType} from '@mionjs/core';
import {hasMethod, useMethodFns} from './methods.ts';
import type {CallContext} from '../types.ts';

// A retry sanitizes the same params again, and a first-match `replace` must not run twice on them.
const sanitizedParams = new WeakSet<any[]>();

/** Runs before validation and serialization, so the client sends what the server sees; never throws, validation reports bad input */
export function sanitizeSubRequests(subRequestIds: string[], context: CallContext): void {
  if (!context.options.sanitizeParams) return;
  for (const id of subRequestIds) {
    const subRequest = context.subRequestList[id];
    if (!subRequest || subRequest.isResolved || subRequest.error) continue;
    const params = subRequest.params;
    if (!Array.isArray(params) || sanitizedParams.has(params)) continue;
    // inputFrom placeholders are filled by the server after the source route runs
    if (subRequest.mappings && subRequest.mappings.length > 0) continue;
    if (!hasMethod(id)) continue;
    const method = useMethodFns(id);
    const formatTransform = method.paramsJitFns.formatTransform;
    if (!method.options?.sanitizeParams || !method.paramsCount || !formatTransform || formatTransform.isNoop) continue;
    // a headersFn's first param is the HeadersSubset, never part of the body params type
    const isHeadersFn = method.type === HandlerType.headersMiddleware && !!method.headersParam;
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
