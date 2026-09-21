/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, createMionRouter, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createVercelHandler, resetVercelHandlerOpts} from '@mionjs/platform-vercel';
import {assertKnownSetupOptions} from './setupOptions.ts';

// ############# Types #############

type SimpleUser = {
  name: string;
  surname: string;
};
type DataPoint = {
  date: Date;
};
type MySharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<MySharedData>;

const getSharedData = () => ({auth: {me: null as any}});

// ############# Routes #############

// Declares the routes; setup() creates the router that actually initializes them, once per setup()
// call (resetRouter() clears the once-guard in between). The serializer is a build-time literal, so
// the `mutate` variant is a second route set rather than a runtime option.
const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

const changeUserName: Route = mion.route((ctx: Context, user: SimpleUser): SimpleUser => {
  return {name: 'NewName', surname: user.surname};
});

const getDate: Route = mion.route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
  return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
});

const updateHeaders: Route = mion.route((context: Context): void => {
  context.response.headers.set('x-something', 'true');
  context.response.headers.set('server', 'my-server');
});

const edgeRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

// Both directions, not just `return`: only a `mutate` params decoder keeps keys the type does not declare.
// `getDate` hands its own argument back, which is what carries those keys to the wire.
const mutateRoutes = {
  changeUserName: mion.route((ctx: Context, user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname}), {
    serializer: 'mutate',
  }),
  getDate: mion.route(
    (ctx: Context, dataPoint?: DataPoint): DataPoint => dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')},
    {serializer: 'mutate'}
  ),
  updateHeaders,
} satisfies Routes;

// ############# Edge Server Setup #############

// No `basePath`: `createVercelHandler` has no such option, vercel's routing hands it a stripped path.
export interface EdgeSetupOptions {
  /** Default is `clone`; `mutate` answers with the in-place serializer. */
  serializer?: 'mutate' | 'clone';
  defaultResponseHeaders?: Record<string, string>;
}

const EDGE_SETUP_KEYS = ['serializer', 'defaultResponseHeaders'] as const satisfies readonly (keyof EdgeSetupOptions)[];

/** Sets up the vercel handler inside the edge runtime. Returns the handler object. */
export async function setup(options?: EdgeSetupOptions) {
  assertKnownSetupOptions(options, EDGE_SETUP_KEYS, 'EdgeTestServer.setup');
  resetVercelHandlerOpts();
  resetRouter();
  const router = createMionRouter({
    contextDataFactory: getSharedData,
    basePath: 'api/',
  });
  router.initRoutes(options?.serializer === 'mutate' ? mutateRoutes : edgeRoutes);
  const handler = createVercelHandler({
    defaultResponseHeaders: options?.defaultResponseHeaders ?? {},
  });
  // Expose handler globally so EdgeVM evaluate() calls can access it
  (globalThis as any).handler = handler;
  return handler;
}

/** Resets all state (router + vercel handler options) */
export function resetServer() {
  resetVercelHandlerOpts();
  resetRouter();
  (globalThis as any).handler = undefined;
}
