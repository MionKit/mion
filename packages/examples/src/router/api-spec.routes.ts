import type {AnyObject} from '@mionkit/core';
import {RpcError, HeadersSubset} from '@mionkit/core';
import {initMionRouter, Routes, CallContext, route, headersFn, rawLinkedFn, linkedFn} from '@mionkit/router';
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

const linkedFns = {
    auth: headersFn((c: Context, {headers}: HeadersSubset<'Authorization'>): void => {
        // do something
    }),
    parser: rawLinkedFn((c: Context, req: HttpRequest, resp, opts): void => undefined),
    parser2: rawLinkedFn((): void => undefined),
    linkedFnNoCtx: linkedFn((): void => undefined),
    linkedFnParams: linkedFn((c: Context, name: string): void => undefined),
    linkedFnCanReturn: linkedFn((c: Context): string => 'hello'),
    log: linkedFn((c: Context): void => undefined),
} satisfies Routes;

export const routesSpec = await initMionRouter(routes);
