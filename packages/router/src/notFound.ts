import type {NotFoundProcedure} from './types/procedures';
import type {Procedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {RawHookDef} from './types/definitions';
import {RpcError, StatusCodes} from '@mionkit/core';
import {getExecutableFromRawHook, startHooks, endHooks} from './router';

let notFoundExecutionPath: Procedure[] | undefined;

// TODO: make this configurable so uses can override behavior
const notFoundHook = {
    type: ProcedureType.rawHook,
    handler: () => new RpcError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`}),
    options: {
        canReturnData: false,
        runOnError: true,
        useValidation: false,
        useSerialization: false,
    },
} satisfies RawHookDef;

export function getNotFoundExecutionPath(): Procedure[] {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const hookName = '_mion404NotfoundHook_';
    const notFoundHandlerExecutable = getExecutableFromRawHook(notFoundHook, [hookName], 0);
    (notFoundHandlerExecutable as NotFoundProcedure).is404 = true;
    notFoundExecutionPath = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    return notFoundExecutionPath;
}
