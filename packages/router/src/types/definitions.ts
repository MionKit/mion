/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawHookHandler} from './handlers';
import {
    HeaderHookOptions,
    HeaderMethod,
    HookOptions,
    HookMethod,
    RawHookOptions,
    RawMethod,
    RouteOptions,
    RouteMethod,
} from './remoteMethods';

// #######  Routes Definitions #######

/** Route definition */
export type RouteDef<H extends Handler = any> = Pick<RouteMethod<H>, 'type' | 'handler'> & {
    options?: RouteOptions;
};

/** Hook definition, a function that hooks into the execution path */
export type HookDef<H extends Handler = any> = Pick<HookMethod<H>, 'type' | 'handler'> & {
    options?: HookOptions;
};

/** Header Hook definition, used to handle header params */
export type HeaderHookDef<H extends HeaderHandler = any> = Pick<HeaderMethod<H>, 'type' | 'handler'> & {
    options?: HeaderHookOptions;
};

/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export type RawHookDef<H extends RawHookHandler = any> = Pick<RawMethod<H>, 'type' | 'handler'> & {
    options?: RawHookOptions;
};

export type AnyHandlerDef = RouteDef | HookDef | HeaderHookDef | RawHookDef;
