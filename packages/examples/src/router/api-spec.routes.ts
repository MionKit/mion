import type {AnyObject} from '@mionjs/core';
import {RpcError, HeadersSubset} from '@mionjs/core';
import {initMionRouter, Routes, CallContext, route, headersFn, rawMiddleFn, middleFn} from '@mionjs/router';
import {IncomingMessage} from 'http';

export type HttpRequest = IncomingMessage & {body: string};
export type Shared = () => AnyObject;
export type Context = CallContext<Shared>;

const routes = {
    sayHello: route((c, name: string): string => 'hello' + name),
    sayHello2: route((c, name: string): string => 'hello' + name),
    sayHello3: route((): string => 'hello'),
    sayHello4: route((): string => 'hello'),
    sayHelloError: route((): RpcError<'typed-error'> => new RpcError({publicMessage: 'error', type: 'typed-error'})),
    maybeError: route((): string | RpcError<'typed-error'> => 'hello'),
} satisfies Routes;

const middleFns = {
    auth: headersFn((c: Context, {headers}: HeadersSubset<'Authorization'>): void => {
        // do something
    }),
    parser: rawMiddleFn((c: Context, req: HttpRequest, resp, opts): void => undefined),
    parser2: rawMiddleFn((): void => undefined),
    middleFnNoCtx: middleFn((): void => undefined),
    middleFnParams: middleFn((c: Context, name: string): void => undefined),
    middleFnCanReturn: middleFn((c: Context): string => 'hello'),
    log: middleFn((c: Context): void => undefined),
} satisfies Routes;

export const routesSpec = await initMionRouter(routes);
