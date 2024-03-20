/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONString, JitFn} from '@mionkit/runtype';
import {NonRawProcedure, Procedure, ProcedureType} from './types/procedures';
import {getRouteExecutionPath} from './router';
import {getNotFoundExecutionPath} from './notFound';
import {NOT_FOUND_HOOK_NAME} from './constants';

type JitBodyFn = JitFn<StringifyBodyFn>;
type ExecutionPathStringifyFns = Record<string, JitFn<(args: any) => JSONString>>;
type StringifyBodyFn = (body: Record<string, any>, bodyStrFns: ExecutionPathStringifyFns) => JSONString;

// ############# PUBLIC METHODS #############

export class BodyStringify {
    constructor(
        public readonly jitStringifyFn: JitBodyFn,
        public readonly jitExecPathStringifyFns: ExecutionPathStringifyFns
    ) {}

    stringify(body: Record<string, any>): JSONString {
        return this.jitStringifyFn.fn(body, this.jitExecPathStringifyFns);
    }
}

export function jitStringify(body: any, path: string): JSONString {
    return getStringifyFnForExecutionPath(path).stringify(body);
}

const NOT_FOUND_PATH = `/nΦt-fΦund:${NOT_FOUND_HOOK_NAME}`;
export function getStringifyFnForExecutionPath(path: string): BodyStringify {
    const executionPath = getRouteExecutionPath(path);
    if (!executionPath) return _getExecutionPathStringifyFn(NOT_FOUND_PATH, getNotFoundExecutionPath());
    return _getExecutionPathStringifyFn(path, executionPath);
}

// ############# PRIVATE METHODS #############

const jitFnsByPath: Map<string, BodyStringify> = new Map();

function _getExecutionPathStringifyFn(path: string, executionPath: Procedure[]): BodyStringify {
    const jitFn = jitFnsByPath.get(path);
    if (jitFn) return jitFn;
    const bodyExecutables = executionPath?.filter(
        (e) => e.options.hasReturnData && e.type !== ProcedureType.headerHook
    ) as NonRawProcedure[];
    const execPathStringifyFns: ExecutionPathStringifyFns = {};
    bodyExecutables.forEach((e) => (execPathStringifyFns[e.id] = e.returnJitFns.jsonStringify));
    const bodyStringify = new BodyStringify(JIT_jsonStringifyFromObject(execPathStringifyFns), execPathStringifyFns);
    jitFnsByPath.set(path, bodyStringify);
    return bodyStringify;
}

/**
 * Creates the JIT code to stringify an object (record) where all it's values are already json stringified strings
 * ie: {params1:'[1, 2, 3]',name:'"John"'} => '{"params1":[1, 2, 3],"name":"John"}'
 */
function JIT_jsonStringifyFromObject(
    record: ExecutionPathStringifyFns,
    bodyVarName = 'bΦdy',
    stringifyFnsName = 'bΦdyStrFns'
): JitBodyFn {
    const keys = Object.keys(record);
    const propsCode = keys
        .map((key, i) => {
            const jsonKey = JSON.stringify(key);
            const keyAccessor = `[${jsonKey}]`;
            const itemAccessor = `${bodyVarName}${keyAccessor}`;
            const stringifyCall = `${stringifyFnsName}${keyAccessor}.fn(${itemAccessor})`;
            const isLast = i === keys.length - 1;
            const separator = isLast ? '' : `+','`;
            return `(${itemAccessor} === undefined ?'': '${jsonKey}:'+${stringifyCall}${separator})`;
        })
        .join('+');
    const code = keys.length ? `return '{'+${propsCode}+'}';` : `return '{}';`;
    return {
        varNames: [bodyVarName, stringifyFnsName],
        code,
        fn: new Function(bodyVarName, stringifyFnsName, code) as StringifyBodyFn,
    };
}
