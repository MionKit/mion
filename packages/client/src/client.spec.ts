/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientMethods} from '..';
import {initClient} from './client';
import {PublicMethods, Routes, initRouter, registerRoutes} from '@mionkit/router';

describe('client should', () => {
    type User = {name: string; surname: string};

    const routes = {
        auth: {hook: (ctx, token: string): User => ({name: 'John', surname: 'Doe'})},
        sayHello: {route: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`},
        log: {hook: (ctx): void => console.log('ending')},
    } satisfies Routes;

    type MyRoutes = typeof routes;
    type MyApi = PublicMethods<MyRoutes>;
    type Auth = MyApi['auth'];
    type SayHello = MyApi['sayHello'];

    type CLientAPi = ClientMethods<MyApi>;
    type ClientAuth = CLientAPi['auth'];
    type ClientSayHello = CLientAPi['sayHello']['params'];
    type Next = ReturnType<ClientSayHello>;

    it('proxy should capture calls', () => {
        const client = initClient<MyApi>();
        const fetchResult = client.auth.fetch();
        const paramsResult = client.auth.params('XYZ');
        const presetResult = client.auth.preset('XYZ');
        expect(fetchResult).toBe('fetch called');
        expect(paramsResult).toBe('params called');
        expect(presetResult).toBe('preset called');
    });

    it('make a remote call', () => {});

    it('fail if a remote call fails', () => {});
});
