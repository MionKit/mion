import type {NotFoundMethod, MethodsExecutionList} from './types/remoteMethods';
import {HandlerType} from './types/remoteMethods';
import type {RouteDef} from './types/definitions';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {startHooks, endHooks, getExecutableFromRoute} from './router';
import {NOT_FOUND_HOOK_NAME} from './constants';

let notFoundExecutionPath: MethodsExecutionList | undefined;

// TODO: make this configurable so uses can override behavior
const notFoundRoute = {
    type: HandlerType.route,
    handler: (): RpcError => new RpcError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`}),
} satisfies RouteDef;

export function getNotFoundExecutionPath(): MethodsExecutionList {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const notFoundHandlerExecutable = getExecutableFromRoute(notFoundRoute, [NOT_FOUND_HOOK_NAME], 0);
    (notFoundHandlerExecutable as NotFoundMethod).is404 = true;
    const methods = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    notFoundExecutionPath = {routeIndex: startHooks.length, methods};
    return notFoundExecutionPath;
}
