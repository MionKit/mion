/* ########
 * 2025s mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {NotFoundMethod, MethodsExecutionList} from '../types/remoteMethods';
import {HandlerType} from '@mionkit/core';
import type {RouteDef} from '../types/definitions';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {startHooks, endHooks, getExecutableFromRoute} from '../router';
import {NOT_FOUND_HOOK_NAME} from '../constants';

let notFoundExecutionPath: MethodsExecutionList | undefined;

// TODO: make this configurable so uses can override behavior
const notFoundRoute = {
    type: HandlerType.route,
    handler: (): RpcError<'route-not-found'> =>
        new RpcError({statusCode: StatusCodes.UNEXPECTED_ERROR, publicMessage: `Route not found`, type: 'route-not-found'}),
} satisfies RouteDef;

export function getNotFoundExecutionPath(): MethodsExecutionList {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const notFoundHandlerExecutable = getExecutableFromRoute(notFoundRoute, [NOT_FOUND_HOOK_NAME], 0);
    (notFoundHandlerExecutable as NotFoundMethod).is404 = true;
    const methods = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    notFoundExecutionPath = {routeIndex: startHooks.length, methods, isNotFound: true};
    return notFoundExecutionPath;
}
