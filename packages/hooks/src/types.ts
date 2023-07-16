/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Context} from '@mionkit/core';

// ####### Hooks #######

export type SimpleHandler<Ret = any> = (
    /** Remote Call parameters */
    ...parameters: any
) => Ret | Promise<Ret>;

/** Route or Hook Handler, the remote function  */
export type Handler<App = any, CallContext extends Context<any> = Context<any>, Ret = any> = (
    /** Static Data: main App, db driver, libraries, etc... */
    app: App,
    /** Call Context */
    context: CallContext,
    /** Remote Call parameters */
    ...parameters: any
) => Ret | Promise<Ret>;

export type InternalHook<CallContext extends Context<any> = Context<any>, Ret = any> = (
    app: any,
    context: CallContext
) => Ret | Promise<Ret>;

/** Hook definition, a function that hooks into the execution path */
export type HookDef<App = any, CallContext extends Context<any> = Context<any>, Ret = any> = {
    /** Executes the hook even if an error was thrown previously */
    forceRunOnError?: boolean;
    /** Enables returning data in the responseBody,
     * hooks must explicitly enable returning data */
    canReturnData?: boolean;
    /** Sets the value in a heather rather than the body */
    inHeader?: boolean;
    /** The fieldName in the request/response body */
    fieldName?: string;
    /** Description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
    /** Used for internal hooks that are required for processing the request/response.
     * It is equivalent to:
     *  - forceRunOnError: true
     *  - canReturnData: false
     *  - inHeader: false
     *  - enableValidation: false
     *  - enableSerialization: false
     * These hooks should only modify the call context and net get any remote parameters or return any data.
     */
    isInternal?: boolean;
    /** Hook handler */
    hook: Handler<App, CallContext, Ret> | SimpleHandler<Ret>;
};

export type HooksCollection = {
    [key: string]: HookDef;
};

// ####### Options #######

