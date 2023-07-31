/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientMethods} from '..';
import {initClient} from './client';
import {RemoteMethods, Routes, initRouter, registerRoutes} from '@mionkit/router';

// TODO: test & write client
describe('client should', () => {
    type User = {name: string; surname: string};

    const routes = {
        auth: {hook: (ctx, token: string): User => ({name: 'John', surname: 'Doe'})},
        sayHello: {route: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`},
        log: {hook: (ctx): void => console.log('ending')},
    } satisfies Routes;

    type MyRoutes = typeof routes;
    type MyApi = RemoteMethods<MyRoutes>;
    type Auth = MyApi['auth']['_handler'];
    type SayHello = MyApi['sayHello']['_handler'];

    type CLientAPi = ClientMethods<MyApi>;
    type ClientAuth = CLientAPi['auth'];
    type ClientSayHello = CLientAPi['sayHello'];
    type Next = ReturnType<ClientSayHello>;

    it('proxy should capture calls', () => {});

    it('make a remote call', () => {});

    it('fail if a remote call fails', () => {});
});
