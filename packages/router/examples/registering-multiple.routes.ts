import {AnyObject, RpcError} from '@mionkit/core';
import {initMionRouter, Routes, CallContext, registerRoutes, route, headersHook} from '@mionkit/router';
import {IncomingMessage} from 'http';

export type HttpRequest = IncomingMessage & {body: string};
export type Shared = () => AnyObject;
export type Context = CallContext<Shared>;

const authRoutes = {
    logIn: route((c, email: string, password: string): string => 'loggedIn'),
    logOut: route((): string => 'loggedOut'),
} satisfies Routes;

const routes = {
    auth: headersHook('Authorization', (c: Context, token: string): null => null),
    sayHello: route((c, name: string): string => 'hello' + name),
    sayHello2: route((c, name: string): string => 'hello' + name),
} satisfies Routes;

export const mayApi = initMionRouter(routes);
export const authApi = registerRoutes(authRoutes);

// export api types to be consumed by the clients
export type MyApi = typeof mayApi;
export type AuthApi = typeof authApi;
