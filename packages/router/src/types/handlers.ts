/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersSubset} from '@mionjs/core';
import {CallContext} from './context.ts';
import {RouterOptions} from './general.ts';
import {MayReturnError} from './publicMethods.ts';

// #######  Route Handlers #######

// type-handler-start
/** Route or MiddleFn Handler  */
export type Handler<Context extends CallContext = any, Params extends any[] = any[], Ret = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: Params
) => Ret | Promise<Ret>;
// type-handler-end

/** Headers MiddleFn Handler, middleFn handler for when params are sent in the header  */
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

/** Handler to use with raw middleFns to get access to raw request and response */
export type RawMiddleFnHandler<
    Context extends CallContext = any,
    RawReq = any,
    RawResp = any,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>,
> = (ctx: Context, request: RawReq, response: RawResp, opts: Opts) => MayReturnError;

// Handler technically covers any of the other handlers
export type AnyHandler<Context extends CallContext = any, Params extends any[] = any, Ret = any> = Handler<Context, Params, Ret>;
