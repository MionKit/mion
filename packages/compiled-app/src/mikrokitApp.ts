/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initHttpApp} from '@mion/http';
import {registerRoutes} from '@mion/router';
import type {RouterOptions, Routes, Route} from '@mion/router';

interface User {
    id: number;
    name: string;
    surname: string;
    lastUpdate: Date;
}

export const app = {};
export const shared = {};

export type App = typeof app;
export type Shared = typeof SharedArrayBuffer;
export type HelloReply = {hello: string};
type SayHello = {hello: string};

export const mionSayHelloRoute: Route = (): SayHello => ({hello: 'world'});

export const routes: Routes = {
    '/': mionSayHelloRoute,
    updateUser: (app: App, context, user: User): User => {
        return {
            ...user,
            lastUpdate: new Date(),
        };
    },
};

export const initHttp = (options: Partial<RouterOptions>) => {
    return initHttpApp<App, Shared>(app, undefined, options);
};

export {registerRoutes as addRoutes};
