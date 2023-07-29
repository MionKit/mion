import {Obj, RouteError} from '@mionkit/core';
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
    sayHelloError: {route: (): RouteError => new RouteError({statusCode: 400, publicMessage: 'error'})},
    maybeError: {route: (): string | RouteError => 'hello'},
} satisfies Routes;

const hooks = {
    auth: {headerHook: (c: Context, token: string): null => null},
    parser: {rawHook: (c: Context, req: HttpRequest, resp, opts): void => undefined},
    parser2: {rawHook: (): void => undefined},
    hookNoCtx: {hook: (): void => undefined},
    hookParams: {hook: (c: Context, name: string): void => undefined},
    hookCanReturn: {canReturnData: true, hook: (c: Context): string => 'hello'},
    log: {hook: (c: Context): void => undefined},
} satisfies Routes;

const routesSpec = registerRoutes(routes);
type RoutesSpec = typeof routesSpec;
type SayHello = RoutesSpec['sayHello']; // type should be PublicRoute
type SayHello2 = RoutesSpec['sayHello2']; // type should be PublicRoute
type SayHello3 = RoutesSpec['sayHello3']; // type should be PublicRoute
type SayHello4 = RoutesSpec['sayHello4']; // type should be PublicRoute
type SayHelloReturn = ReturnType<RoutesSpec['sayHello']['_handler']>; // should be [string]
type SayHelloErrorReturn = ReturnType<RoutesSpec['sayHelloError']['_handler']>; // should be [null, PublicError]
type maybeErrorReturn = ReturnType<RoutesSpec['maybeError']['_handler']>; // should be [string | null, PublicError]

const hooksSpec = registerRoutes(hooks);
type HookSpec = typeof hooksSpec;
type Auth = HookSpec['auth']; // type should be PublicHook as has parameters
type Parser = HookSpec['parser']; // type should be null
type Parser2 = HookSpec['parser2']; // type should be null
type HookNoCtx = HookSpec['hookNoCtx']; // type should be null
type HookParams = HookSpec['hookParams']; // type should be PublicHook as has params
type HookCanReturn = HookSpec['hookCanReturn']; // type should be PublicHook as canReturnData
type Log = HookSpec['log']; // type should be null
