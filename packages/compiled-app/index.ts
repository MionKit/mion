/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initHttpApp} from '@mikrokit/http';
import {MkRouter, RouterOptions} from '@mikrokit/router';

export const app = {};
export const shared = {};

export type App = typeof app;
export type Shared = typeof SharedArrayBuffer;

export const routes = {
    '/': () => ({hello: 'world'}),
};

export const initHttp = (options: Partial<RouterOptions>) => {
    return initHttpApp<App, Shared>(app, undefined, options);
};

export const addRoutes = (rts: typeof routes) => MkRouter.addRoutes(rts);
