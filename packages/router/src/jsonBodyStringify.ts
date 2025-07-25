/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NonRawMethod, Method, HandlerType} from './types/remoteMethods';
import {getRouteExecutionPath} from './router';
import {getNotFoundExecutionPath} from './notFound';

// ############# PUBLIC METHODS #############

export function jitBodyStringify(body: any, path: string): string {
    return getStringifyFnForExecutionPath(path)(body);
}

export function getStringifyFnForExecutionPath(path: string): (body: any) => string {
    const executionPath = getRouteExecutionPath(path) || getNotFoundExecutionPath();
    if (executionPath?.bodyStringify) return executionPath.bodyStringify;
    executionPath.bodyStringify = _getExecutionPathStringifyFn(executionPath.methods);
    return executionPath.bodyStringify;
}

// ############# PRIVATE METHODS #############

function _getExecutionPathStringifyFn(executionPath: Method[]): (body: any) => string {
    const returnMethods = executionPath.filter(
        (p) => p.options.hasReturnData && p.type !== HandlerType.headerHook
    ) as NonRawMethod[];
    return (body: any): string => {
        const props: string[] = [];
        for (let i = 0; i < returnMethods.length; i++) {
            const method = returnMethods[i];
            const isLast = i === returnMethods.length - 1;
            const returnValue = body[method.id];
            if (!returnValue) continue;
            const coma = isLast ? '' : ',';
            const jsonStringify = method.returnJitFns.jsonStringify.fn;
            const jsonValue = jsonStringify(returnValue);
            props.push(`${JSON.stringify(method.id)}:${jsonValue}${coma}`);
        }
        return `{${props.join('')}}`;
    };
}
