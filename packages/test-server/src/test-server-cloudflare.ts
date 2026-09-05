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

// Declares the routes; setup() creates the router that actually initializes them and picks the route set for the
// framing under test (resetRouter() clears the once-guard in between).
const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

const changeUserNameHandler = (ctx: Context, user: SimpleUser): SimpleUser => {
  return {name: 'NewName', surname: user.surname};
};
const changeUserName: Route = mion.route(changeUserNameHandler);

const getDateHandler = (ctx: Context, dataPoint?: DataPoint): DataPoint => {
  return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
};
const getDate: Route = mion.route(getDateHandler);

const updateHeadersHandler = (context: Context): void => {
  context.response.headers.set('x-something', 'true');
  context.response.headers.set('server', 'my-server');
};
const updateHeaders: Route = mion.route(updateHeadersHandler);

// The same routes with a `direct` return (each member writes its own JSON string: the stringifyJson framing); the
// default `mutate` return hands the platform a value to stringify (the json framing).
const directRoutes = {
  changeUserName: mion.route(changeUserNameHandler, {serializer: {return: 'direct'}}),
  getDate: mion.route(getDateHandler, {serializer: {return: 'direct'}}),
  updateHeaders: mion.route(updateHeadersHandler, {serializer: {return: 'direct'}}),
};

const cloudflareRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

// ############# Cloudflare Server Setup #############

export interface CloudflareSetupOptions {
  basePath?: string;
  /** the return strategy of the routes: `direct` (the stringifyJson framing, the default here) or `mutate` (the json framing) */
  serializer?: 'direct' | 'mutate';
  defaultResponseHeaders?: Record<string, string>;
}

/** Sets up the cloudflare handler inside the workerd runtime. Returns the handler object. */
export async function setup(options?: CloudflareSetupOptions) {
  resetCloudflareHandlerOpts();
  resetRouter();
  const router = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
  router.initRoutes(options?.serializer === 'mutate' ? cloudflareRoutes : directRoutes);
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
