/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersSubset} from '@mionkit/core';
import {CallContext} from './context';
import {RouterOptions} from './general';
import {MayReturnError} from './publicMethods';

// #######  Route Handlers #######

// type-handler-start
/** Route or Hook Handler  */
export type Handler<Context extends CallContext = any, Params extends any[] = any[], Ret = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: Params
) => Ret | Promise<Ret>;
// type-handler-end

/** Header Hook Handler, hook handler for when params are sent in the header  */
export type HeaderHandler<
    Context extends CallContext = any,
    ExpectedHeaders extends HeadersSubset<any> = any,
    Params extends any[] = any[],
    Ret = any,
> = (
    /** Call Context */
    context: Context,
    /** Remote Call Headers */
    headers: ExpectedHeaders,
    /** Remote Call parameters */
    ...parameters: Params
) => Ret | Promise<Ret>;

/** Handler to use with raw hooks to get access to raw request and response */
export type RawHookHandler<
    Context extends CallContext = any,
    RawReq = any,
    RawResp = any,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>,
> = (ctx: Context, request: RawReq, response: RawResp, opts: Opts) => MayReturnError;

// Handler technically covers any of the other handlers
export type AnyHandler<Context extends CallContext = any, Params extends any[] = any, Ret = any> = Handler<Context, Params, Ret>;
