/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    HeaderProcedureOptions,
    HookProcedureOptions,
    ProcedureType,
    RawProcedureOptions,
    RouteProcedureOptions,
} from './types/procedures';
import {Handler, HeaderHandler, RawHookHandler} from './types/handlers';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './types/definitions';

// ############# Route & Hooks initialization #############
// these functions are just helpers to initialize the route & hooks objects and keep route definitions clean

export function route<const H extends Handler, const Opts extends RouteProcedureOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.route,
        handler,
        forceRunOnError: false,
        canReturnData: true,
        //  hack to init properties and not pollute type
        ...({
            enableValidation: opts?.enableValidation ?? true,
            enableSerialization: opts?.enableSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies RouteDef<H>;
    return procedure;
}

export function hook<const H extends Handler, const Opts extends HookProcedureOptions | undefined>(handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.hook,
        handler,
        forceRunOnError: opts?.forceRunOnError ?? false,
        //  hack to init properties and not pollute type
        ...({
            enableValidation: opts?.enableValidation ?? true,
            enableSerialization: opts?.enableSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies HookDef<H>;
    return procedure;
}

export function headersHook<
    const S extends string,
    const H extends HeaderHandler,
    const Opts extends HeaderProcedureOptions | undefined,
>(headerName: S, handler: H, opts?: Opts) {
    const procedure = {
        type: ProcedureType.headerHook,
        headerName,
        handler,
        forceRunOnError: opts?.forceRunOnError ?? false,
        //  hack to init properties and not pollute type
        ...({
            enableValidation: opts?.enableValidation ?? true,
            enableSerialization: opts?.enableSerialization ?? true,
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies HeaderHookDef<H>;
    return procedure;
}

export function rawHook<const H extends RawHookHandler, const Opts extends RawProcedureOptions | undefined>(
    handler: H,
    opts?: Opts
) {
    const procedure = {
        type: ProcedureType.rawHook,
        handler,
        forceRunOnError: opts?.forceRunOnError ?? false,
        enableValidation: false,
        enableSerialization: false,
        canReturnData: false,
        ...({
            description: opts?.description,
        } as any as {}), // eslint-disable-line @typescript-eslint/ban-types
    } satisfies RawHookDef<H>;
    return procedure;
}
