/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The client half of the test server's csrf middleware: an installer that gets the typed middleware,
// wherever the app placed it, and imports only the server handler's type.

import type {csrf} from '@mionjs/test-server';
import type {ClientMiddlewareOf} from '../../src/types.ts';

export interface CsrfOptions {
  getToken(): string;
  refreshToken(): Promise<void>;
}

export function useCsrf(middleware: ClientMiddlewareOf<typeof csrf>, options: CsrfOptions): void {
  middleware.onRequest((call) => call(options.getToken()));
  middleware.onError('csrf-expired', async (_error, context) => {
    await options.refreshToken();
    context.retry();
  });
}
