/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, createMionRouter, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts} from '@mionjs/platform-cloudflare';
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

const cloudflareRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

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

// ############# Cloudflare Server Setup #############

export interface CloudflareSetupOptions {
  /** URL prefix the handler strips before routing. */
  basePath?: string;
  /** Default is `clone`; `mutate` answers with the in-place serializer. */
  serializer?: 'mutate' | 'clone';
  defaultResponseHeaders?: Record<string, string>;
}

const CLOUDFLARE_SETUP_KEYS = [
  'basePath',
  'serializer',
  'defaultResponseHeaders',
] as const satisfies readonly (keyof CloudflareSetupOptions)[];

/** Sets up the cloudflare handler inside the workerd runtime. Returns the handler object. */
export async function setup(options?: CloudflareSetupOptions) {
  assertKnownSetupOptions(options, CLOUDFLARE_SETUP_KEYS, 'CloudflareTestServer.setup');
  resetCloudflareHandlerOpts();
  resetRouter();
  const router = createMionRouter({
    contextDataFactory: getSharedData,
    basePath: 'api/',
  });
  router.initRoutes(options?.serializer === 'mutate' ? mutateRoutes : cloudflareRoutes);
  const handler = createCloudflareHandler({
    basePath: options?.basePath ?? '',
    defaultResponseHeaders: options?.defaultResponseHeaders ?? {},
  });
  // Expose handler globally so the service worker fetch listener can access it
  (globalThis as any).handler = handler;
  return handler;
}

/** Resets all state (router + cloudflare handler options) */
export function resetServer() {
  resetCloudflareHandlerOpts();
  resetRouter();
  (globalThis as any).handler = undefined;
}
