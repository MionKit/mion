/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NonRawProcedure, Procedure, ProcedureType} from './types/procedures';
import {getRouteExecutionPath} from './router';
import {getNotFoundExecutionPath} from './notFound';

// ############# PUBLIC METHODS #############

export function jitBodyStringify(body: any, path: string): string {
    return getStringifyFnForExecutionPath(path)(body);
}

export function getStringifyFnForExecutionPath(path: string): (body: any) => string {
    const executionPath = getRouteExecutionPath(path) || getNotFoundExecutionPath();
    if (executionPath?.bodyStringify) return executionPath.bodyStringify;
    executionPath.bodyStringify = _getExecutionPathStringifyFn(executionPath.procedures);
    return executionPath.bodyStringify;
}

// ############# PRIVATE METHODS #############

function _getExecutionPathStringifyFn(executionPath: Procedure[]): (body: any) => string {
    const returnProcedures = executionPath.filter(
        (p) => p.options.hasReturnData && p.type !== ProcedureType.headerHook
    ) as NonRawProcedure[];
    return (body: any): string => {
        const props: string[] = [];
        for (let i = 0; i < returnProcedures.length; i++) {
            const procedure = returnProcedures[i];
            const isLast = i === returnProcedures.length - 1;
            const returnValue = body[procedure.id];
            if (!returnValue) continue;
            const coma = isLast ? '' : ',';
            props.push(`${JSON.stringify(procedure.id)}:${procedure.returnJitFns.jsonStringify.fn(returnValue)}${coma}`);
        }
        return `{${props.join('')}}`;
    };
}
