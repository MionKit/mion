/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Placeholder that proves the `@mionjs/client/middlewares` entry works; route sync replaces it.

import type {ClientMiddlewareOf} from '../types.ts';

/** The server handler's shape, repeated so the client never imports the router */
type EchoTagHandler = (ctx: unknown, tag?: string) => string;

/** Sends `getTag()` on every request that runs the middleware, and hands its answer to `onTag` */
export function useEchoTag(
  middleware: ClientMiddlewareOf<EchoTagHandler>,
  getTag: () => string | undefined,
  onTag?: (tag: string) => void
): void {
  middleware.onRequest((call) => {
    const tag = getTag();
    if (tag !== undefined) call(tag);
  });
  if (onTag) middleware.onResponse((tag) => onTag(tag));
}
