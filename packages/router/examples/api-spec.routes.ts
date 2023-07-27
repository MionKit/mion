import {Obj} from '@mionkit/core';
import {registerRoutes, Routes, PureRoutes, CallContext} from '@mionkit/router';
import {IncomingMessage} from 'http';

export type HttpRequest = IncomingMessage & {body: string};
export type Shared = () => Obj;
export type Context = CallContext<Shared>;

const routes = {
    sayHello: (c, name: string): string => 'hello' + name,
    sayHello2: {route: (c, name: string): string => 'hello' + name},
    sayHello3: (): string => 'hello',
    sayHello4: {route: (): string => 'hello'},
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

const pureRoutes = {
    sayHello: (name: string): string => 'hello' + name,
    sayHello2: {route: (name: string): string => 'hello' + name},
    sayHello3: (): string => 'hello',
    sayHello4: {route: (): string => 'hello'},
} satisfies PureRoutes;

const pureHooks = {
    auth: {headerHook: (token: string): null => null},
    parser: {rawHook: (c: Context, req: HttpRequest, resp, opts): void => undefined},
    parser2: {rawHook: (): void => undefined},
    hookNoCtx: {hook: (): void => undefined},
    hookParams: {hook: (name: string): void => undefined},
    hookCanReturn: {canReturnData: true, hook: (): string => 'hello'},
    log: {hook: (): void => undefined},
} satisfies PureRoutes;

const routesSpec = registerRoutes(routes);
type RoutesSpec = typeof routesSpec;
type SayHello = RoutesSpec['sayHello']; // type should be PublicRoute
type SayHello2 = RoutesSpec['sayHello2']; // type should be PublicRoute
type SayHello3 = RoutesSpec['sayHello3']; // type should be PublicRoute
type SayHello4 = RoutesSpec['sayHello4']; // type should be PublicRoute

const hooksSpec = registerRoutes(hooks);
type HookSpec = typeof hooksSpec;
type Auth = HookSpec['auth']; // type should be PublicHook as has parameters
type Parser = HookSpec['parser']; // type should be null
type Parser2 = HookSpec['parser2']; // type should be null
type HookNoCtx = HookSpec['hookNoCtx']; // type should be null
type HookParams = HookSpec['hookParams']; // type should be PublicHook as has params
type HookCanReturn = HookSpec['hookCanReturn']; // type should be PublicHook as canReturnData
type Log = HookSpec['log']; // type should be null

// TODO public routes are wrong here
const pureRoutesSpec = registerRoutes(pureRoutes);
type PureRoutesSpec = typeof pureRoutesSpec;
type PSayHello = PureRoutesSpec['sayHello']; // type should be PublicRoute
type PSayHello2 = PureRoutesSpec['sayHello2']; // type should be PublicRoute
type PSayHello3 = PureRoutesSpec['sayHello3']; // type should be PublicRoute
type PSayHello4 = PureRoutesSpec['sayHello4']; // type should be PublicRoute

const pureHooksSpec = registerRoutes(pureHooks);
type PureHooksSpec = typeof pureHooksSpec;
type PAuth = PureHooksSpec['auth']; // type should be PublicHook as has parameters
type PParser = PureHooksSpec['parser']; // type should be null
type PParser2 = PureHooksSpec['parser2']; // type should be null
type PHookNoCtx = PureHooksSpec['hookNoCtx']; // type should be null
type PHookParams = PureHooksSpec['hookParams']; // type should be PublicHook as has params
type PHookCanReturn = PureHooksSpec['hookCanReturn']; // type should be PublicHook as canReturnData
type PLog = PureHooksSpec['log']; // type should be null
