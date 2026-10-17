/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// `alwaysAwait: false`, as the Bun and uWS bench lanes run. Its own file: the router option is global.
//   pnpm exec vitest bench --project router dispatchNoAwait

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter} from '../router.ts';
import {dispatchRoute} from '../dispatch.ts';
import {headersFromRecord} from '../lib/headers.ts';
import {Routes} from '../types/general.ts';

resetRouter();
const mion = createMionRouter({alwaysAwait: false});

const routes = {
  syncChain: {
    first: mion.middleware((): void => undefined),
    second: mion.middleware((): void => undefined),
    route: mion.route((_ctx, name: string): string => name),
  },
  asyncChain: {
    first: mion.middleware(async (): Promise<void> => undefined),
    second: mion.middleware(async (): Promise<void> => undefined),
    third: mion.middleware(async (): Promise<void> => undefined),
    route: mion.route(async (_ctx, name: string): Promise<string> => name),
  },
} satisfies Routes;

mion.initRoutes(routes);

const body = JSON.stringify(['Rex']);
const reqHeaders = headersFromRecord({});

function dispatch(path: string) {
  return dispatchRoute(path, body, reqHeaders, headersFromRecord({}), {}, {});
}

describe('dispatch with alwaysAwait off', () => {
  bench('all-sync chain, two middlewares', async () => {
    await dispatch('/syncChain/route');
  });

  bench('three async middlewares and an async route', async () => {
    await dispatch('/asyncChain/route');
  });
});
