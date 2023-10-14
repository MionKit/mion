/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CallContext, HeaderValue} from './context';
import {RouterOptions} from './general';
import {Handler, HeaderHandler, RawHookHandler} from './handlers';

// #######  Routes Definitions #######

/** Route definition */
export interface RouteDef<Context extends CallContext = CallContext, Ret = any> {
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** Overrides global enableValidation */
    enableValidation?: boolean;
    /** Overrides global enableSerialization */
    enableSerialization?: boolean;
    /** Route Handler */
    route: Handler<Context, Ret>;
}

interface HookBase {
    /** Executes the hook even if an error was thrown previously */
    forceRunOnError?: boolean;
    /** Description of the route, mostly for documentation purposes */
    description?: string;
    /** Overrides global enableValidation */
    enableValidation?: boolean;
    /** Overrides global enableSerialization */
    enableSerialization?: boolean;
}

/** Hook definition, a function that hooks into the execution path */
export interface HookDef<Context extends CallContext = CallContext, Ret = any> extends HookBase {
    /** Hook handler */
    hook: Handler<Context, Ret>;
}

/** Header Hook definition, used to handle header params */
export interface HeaderHookDef<
    Context extends CallContext = CallContext,
    HReqValue extends HeaderValue = any,
    HRespValue extends HeaderValue = any,
> extends HookBase {
    /** the name of the header in the request/response */
    headerName: string;
    hook: HeaderHandler<Context, HReqValue, HRespValue>;
}

/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export interface RawHookDef<
    Context extends CallContext = CallContext,
    RawReq = unknown,
    RawResp = unknown,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>,
> {
    isRawHook: true;
    hook: RawHookHandler<Context, RawReq, RawResp, Opts>;
}
