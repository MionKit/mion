/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The server half of an isolated reusable middleware: only the handler, placed in the routes like any
// middleware. Its client half lives in another package and imports this file's types only.

import {FatalError} from '@mionjs/core';
import type {CallContext} from '@mionjs/router';

let currentToken = 'fresh';

/** The token a client must send; rotating it makes every copy a client holds stale */
export function getCsrfToken(): string {
  return currentToken;
}

export function rotateCsrfToken(): string {
  currentToken = `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return currentToken;
}

/** A stale token ends the chain before the route runs, so the client can refresh it and retry */
export function csrf(_ctx: CallContext, token: string): void | FatalError<'csrf-expired'> {
  if (token !== currentToken) return new FatalError({type: 'csrf-expired', publicMessage: 'The CSRF token expired'});
}
