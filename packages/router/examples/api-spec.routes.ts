import {Obj, RpcError} from '@mionkit/core';
import {registerRoutes, Routes, CallContext} from '@mionkit/router';
import {IncomingMessage} from 'http';

export type HttpRequest = IncomingMessage & {body: string};
export type Shared = () => Obj;
export type Context = CallContext<Shared>;

const routes = {
    sayHello: (c, name: string): string => 'hello' + name,
    sayHello2: {route: (c, name: string): string => 'hello' + name},
    sayHello3: (): string => 'hello',
    sayHello4: {route: (): string => 'hello'},
    sayHelloError: {route: (): RpcError => new RpcError({statusCode: 400, publicMessage: 'error'})},
    maybeError: {route: (): string | RpcError => 'hello'},
} satisfies Routes;

const hooks = {
    auth: {headerName: 'Authorization', hook: (c: Context, token: string): null => null},
    parser: {isRawHook: true, hook: (c: Context, req: HttpRequest, resp, opts): void => undefined},
    parser2: {isRawHook: true, hook: (): void => undefined},
    hookNoCtx: {hook: (): void => undefined},
    hookParams: {hook: (c: Context, name: string): void => undefined},
    hookCanReturn: {hook: (c: Context): string => 'hello'},
    log: {hook: (c: Context): void => undefined},
} satisfies Routes;

export const routesSpec = registerRoutes(routes);
