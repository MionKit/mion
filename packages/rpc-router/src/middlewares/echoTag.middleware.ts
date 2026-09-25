/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Placeholder that proves the `@mionjs/router/middlewares` entry works; route sync replaces it.

import {middleware} from '../lib/handlers.ts';
import type {MiddlewaresCollection} from '../types/publicMethods.ts';
import type {CallContext} from '../types/context.ts';

export function echoTag(_ctx: CallContext, tag?: string): string {
  return tag ?? '';
}

/** Spread into the routes, at the root or inside a group, like any middleware */
export const mionEchoTag = {
  'mion@echoTag': middleware(echoTag),
} as const satisfies MiddlewaresCollection;
