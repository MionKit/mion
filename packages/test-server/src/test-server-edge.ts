/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, createMionRouter, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createVercelHandler, resetVercelHandlerOpts} from '@mionjs/platform-vercel';

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

const edgeRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

// ############# Edge Server Setup #############

export interface EdgeSetupOptions {
  basePath?: string;
  /** the return strategy of the routes: `direct` (the stringifyJson framing, the default here) or `mutate` (the json framing) */
  serializer?: 'direct' | 'mutate';
  defaultResponseHeaders?: Record<string, string>;
}

/** Sets up the vercel handler inside the edge runtime. Returns the handler object. */
export async function setup(options?: EdgeSetupOptions) {
  resetVercelHandlerOpts();
  resetRouter();
  const router = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
  router.initRoutes(options?.serializer === 'mutate' ? edgeRoutes : directRoutes);
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
