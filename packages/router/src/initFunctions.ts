/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderHookOptions, HookOptions, ProcedureType, RawHookOptions, RouteOptions} from './types/procedures';
import {Handler, HeaderHandler, RawHookHandler} from './types/handlers';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './types/definitions';

// ############# Route & Hooks initialization #############
// these functions are just helpers to initialize the route & hooks objects and keep route definitions clean

export function route<H extends Handler, Opts extends RouteOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.route,
        handler,
        //  hack to init properties and not pollute type
        options: {
            canReturnData: true,
            runOnError: false,
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        },
    } satisfies RouteDef<H>;
    return procedure;
}

export function hook<H extends Handler, Opts extends HookOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.hook,
        handler,
        options: {
            runOnError: opts?.runOnError ?? false,
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        },
    } satisfies HookDef<H>;
    return procedure;
}

export function headersHook<S extends string, H extends HeaderHandler, Opts extends HeaderHookOptions | undefined>(
    headerName: S,
    handler: H,
    opts?: Opts
) {
    const procedure = {
        type: ProcedureType.headerHook,
        headerName,
        handler,
        options: {
            runOnError: opts?.runOnError ?? false,
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        },
    } satisfies HeaderHookDef<H>;
    return procedure;
}

export function rawHook<H extends RawHookHandler, Opts extends RawHookOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.rawHook,
        handler,
        options: {
            runOnError: opts?.runOnError ?? false,
            useValidation: false,
            useSerialization: false,
            canReturnData: false,
            description: opts?.description,
        },
    } satisfies RawHookDef<H>;
    return procedure;
}
