/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Method, HandlerType} from './types/remoteMethods';
import {getRouteExecutionPath} from './router';
import {getNotFoundExecutionPath} from './notFound';
import {RpcError} from '@mionkit/core';
import type {PublicResponses} from './types/publicMethods';

// ############# PUBLIC METHODS #############

export function jitStringifyResponseBody(
    respBody: PublicResponses,
    path: string
): {body: string; stringifyErrors: Record<string, RpcError<any>>} {
    return getStringifyFnForExecutionPath(path)(respBody);
}

export function getStringifyFnForExecutionPath(
    path: string
): (respBody: PublicResponses) => {body: string; stringifyErrors: Record<string, RpcError<any>>} {
    const executionPath = getRouteExecutionPath(path) || getNotFoundExecutionPath();
    if (executionPath?.bodyStringify) return executionPath.bodyStringify;
    executionPath.bodyStringify = _getExecutionPathStringifyFn(executionPath.methods);
    return executionPath.bodyStringify;
}

// ############# PRIVATE METHODS #############

function _getExecutionPathStringifyFn(
    executionPath: Method[]
): (respBody: PublicResponses) => {body: string; stringifyErrors: Record<string, RpcError<any>>} {
    const returnMethods = executionPath.filter((p) => p.hasReturnData && p.type !== HandlerType.headerHook) as Method[];
    return (respBody: PublicResponses): {body: string; stringifyErrors: Record<string, RpcError<any>>} => {
        const props: string[] = [];
        const stringifyErrors: Record<string, RpcError<any>> = {};
        for (let i = 0; i < returnMethods.length; i++) {
            const method = returnMethods[i];
            const isLast = i === returnMethods.length - 1;
            const returnValue = respBody[method.id];
            if (!returnValue) continue;
            const coma = isLast ? '' : ',';
            const jitJsonStringify = method.returnJitFns.jsonStringify.fn;
            try {
                const jsonValue = jitJsonStringify(returnValue);
                props.push(`${JSON.stringify(method.id)}:${jsonValue}${coma}`);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e: any) {
                const err = new RpcError({
                    statusCode: 500,
                    type: 'Stringify Response Error',
                    publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.jsonStringify.typeName}`,
                });
                stringifyErrors[method.id] = err;
            }
        }
        return {body: `{${props.join('')}}`, stringifyErrors};
    };
}
