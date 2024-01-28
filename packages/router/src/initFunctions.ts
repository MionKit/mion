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

export function route<const H extends Handler, const Opts extends RouteOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.route,
        handler,
        runOnError: false,
        canReturnData: true,
        //  hack to init properties and not pollute type
        ...({
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies RouteDef<H>;
    return procedure;
}

export function hook<const H extends Handler, const Opts extends HookOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.hook,
        handler,
        runOnError: opts?.runOnError ?? false,
        //  hack to init properties and not pollute type
        ...({
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies HookDef<H>;
    return procedure;
}

export function headersHook<
    const S extends string,
    const H extends HeaderHandler,
    const Opts extends HeaderHookOptions | undefined,
>(headerName: S, handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.headerHook,
        headerName,
        handler,
        runOnError: opts?.runOnError ?? false,
        //  hack to init properties and not pollute type
        ...({
            useValidation: opts?.useValidation ?? true,
            useSerialization: opts?.useSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies HeaderHookDef<H>;
    return procedure;
}

export function rawHook<const H extends RawHookHandler, const Opts extends RawHookOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.rawHook,
        handler,
        runOnError: opts?.runOnError ?? false,
        useValidation: false,
        useSerialization: false,
        canReturnData: false,
        ...({
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies RawHookDef<H>;
    return procedure;
}
