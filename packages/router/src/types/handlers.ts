/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CallContext, HeaderValue} from './context';
import {RouterOptions} from './general';
import {ErrorReturn} from './publicProcedures';

// #######  Route Handlers #######

/** Route or Hook Handler  */
export type Handler<Context extends CallContext = any, Ret = any, Params extends any[] = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: Params
) => Ret | Promise<Ret>;

/** Header Hook Handler, hook handler for when params are sent in the header  */
export type HeaderHandler<
    Context extends CallContext = any,
    HReqValue extends HeaderValue = any,
    HRespValue extends HeaderValue | undefined = any,
> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    headerValue: HReqValue
) => HRespValue | Promise<HRespValue>;

/** Handler to use with raw hooks to get access to raw request and response */
export type RawHookHandler<
    Context extends CallContext = any,
    RawReq = any,
    RawResp = any,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>,
> = (ctx: Context, request: RawReq, response: RawResp, opts: Opts) => ErrorReturn;

// Handler technically covers any of the other handlers
export type AnyHandler<Context extends CallContext = any, Ret = any, Params extends any[] = any> = Handler<Context, Ret, Params>;
