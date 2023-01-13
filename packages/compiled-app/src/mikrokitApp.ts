/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initHttpApp} from '@mikrokit/http';
import {Router, RouterOptions, Routes, Route} from '@mikrokit/router';

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

export const mikrokitSayHelloRoute: Route = (): SayHello => ({hello: 'world'});

export const routes: Routes = {
    '/': mikrokitSayHelloRoute,
    updateUser: (context, user: User): User => {
        return {
            ...user,
            lastUpdate: new Date(),
        };
    },
};

export const initHttp = (options: Partial<RouterOptions>) => {
    return initHttpApp<App, Shared>(app, undefined, options);
};

export const addRoutes = (rts: typeof routes) => Router.addRoutes(rts);
