/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, createMionRouter, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts} from '@mionjs/platform-cloudflare';

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
// call (resetRouter() clears the once-guard in between). The encoder is a build-time literal, so the
// `direct` variant is a second route set rather than a runtime option.
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

// the same routes answering with the `direct` encoder (the router joins the strings)
const directRoutes = {
  changeUserName: mion.route((ctx: Context, user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname}), {
    encoder: {return: 'direct'},
  }),
  getDate: mion.route(
    (ctx: Context, dataPoint?: DataPoint): DataPoint => dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')},
    {encoder: {return: 'direct'}}
  ),
  updateHeaders,
} satisfies Routes;

// ############# Cloudflare Server Setup #############

export interface CloudflareSetupOptions {
  basePath?: string;
  /** `direct` answers with the string encoder (stringifyJson framing); the default is `mutate` (json framing). */
  encoder?: 'direct' | 'mutate';
  defaultResponseHeaders?: Record<string, string>;
}

/** Sets up the cloudflare handler inside the workerd runtime. Returns the handler object. */
export async function setup(options?: CloudflareSetupOptions) {
  resetCloudflareHandlerOpts();
  resetRouter();
  const router = createMionRouter({
    contextDataFactory: getSharedData,
    basePath: 'api/',
  });
  router.initRoutes(options?.encoder === 'direct' ? directRoutes : cloudflareRoutes);
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
