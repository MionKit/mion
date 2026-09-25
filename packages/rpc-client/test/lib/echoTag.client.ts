/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Client half of the test server's echoTag middleware, whose params are all optional.

import type {echoTag} from '@mionjs/test-server';
import type {ClientMiddlewareOf} from '../../src/types.ts';

/** Sends `getTag()` on every request that runs the middleware, and hands its answer to `onTag` */
export function useEchoTag(
  middleware: ClientMiddlewareOf<typeof echoTag>,
  getTag: () => string | undefined,
  onTag?: (tag: string) => void
): void {
  middleware.onRequest((call) => {
    const tag = getTag();
    if (tag !== undefined) call(tag);
  });
  if (onTag) middleware.onResponse((tag) => onTag(tag));
}
