import type {NotFoundProcedure, ProceduresExecutionList} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {RouteDef} from './types/definitions';
import {RpcError, StatusCodes} from '@mionkit/core';
import {startHooks, endHooks, getExecutableFromRoute} from './router';
import {NOT_FOUND_HOOK_NAME} from './constants';

let notFoundExecutionPath: ProceduresExecutionList | undefined;

// TODO: make this configurable so uses can override behavior
const notFoundRoute = {
    type: ProcedureType.route,
    handler: () => new RpcError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`}),
} satisfies RouteDef;

export function getNotFoundExecutionPath(): ProceduresExecutionList {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const notFoundHandlerExecutable = getExecutableFromRoute(notFoundRoute, [NOT_FOUND_HOOK_NAME], 0);
    (notFoundHandlerExecutable as NotFoundProcedure).is404 = true;
    const procedures = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    notFoundExecutionPath = {routeIndex: startHooks.length, procedures};
    return notFoundExecutionPath;
}
