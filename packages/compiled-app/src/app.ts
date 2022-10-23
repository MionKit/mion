/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {HttpCallContext, initHttpApp} from '@mikrokit/http';
import {Handler, MkRouter, Route, Routes} from '@mikrokit/router';

export const app = {};
export const shared = {};
export const helloWorld: Handler = () => ({hello: 'world'});

export type App = typeof app;
export type Shared = typeof SharedArrayBuffer;
export type HelloWorldHandler = typeof helloWorld;
export type HelloWorld = ReturnType<typeof helloWorld>;
export type Context = HttpCallContext<App, Shared>;

export const routes: Routes = {
    '/': helloWorld,
};

export const initHttp = () => {
    const {emptyContext, startHttpServer} = initHttpApp(app);
    return startHttpServer;
};

export const addRoutes = () => MkRouter.addRoutes(routes);
