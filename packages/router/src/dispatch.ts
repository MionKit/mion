/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, HeadersRecord} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderProcedure, NonRawProcedure, RouteProcedure, type Procedure, RawProcedure, HookProcedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import {isNotFoundExecutable} from './types/guards';
import {getRouteExecutionPath, getRouterOptions} from './router';
import {getNotFoundExecutionPath} from './notFound';
import {isPromise} from 'node:util/types';
import {Mutable, AnyObject, RpcError, StatusCodes} from '@mionkit/core';
import {handleRpcErrors} from './errors';
import {JitFn} from '@mionkit/runtype';

// ############# PUBLIC METHODS #############

/*
 * NOTE:
 * different options has been tested to improve performance but were discarded due to worst or no noticeable improvements
 * - using promisify(setImmediate): worst or no improvement
 * - using queueMicrotask instead of setImmediate: definitely worst
 * - using callback instead promises: seems to be more slow but use less memory in some scenarios.
 */

export async function dispatchRoute<Req, Resp>(
    path: string,
    reqRawBody: string,
    reqHeaders: Headers,
    respHeaders: Headers,
    rawRequest: Req,
    rawResponse?: Resp
): Promise<MionResponse> {
    try {
        const opts = getRouterOptions();
        // this is the call context that will be passed to all handlers
        // we should keep it as small as possible
        const context = getEmptyCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders);

        const executionPath = getRouteExecutionPath(context.path) || getNotFoundExecutionPath();
        await runExecutionPath(context, rawRequest, rawResponse, executionPath.procedures, opts);
        // if (opts.useJitDispatch) {
        //     const compiledRun = getCompiledExecutionPath(context.path, executionPath.procedures);
        //     console.log(compiledRun.fn.toString());
        //     await compiledRun.fn(
        //         context,
        //         rawRequest,
        //         rawResponse,
        //         executionPath.procedures,
        //         opts,
        //         handleProcedureError,
        //         validateParametersOrThrow,
        //         deserializeParameters,
        //         ProcedureType,
        //         RpcError
        //     );
        // } else {
        //     await runExecutionPath(context, rawRequest, rawResponse, executionPath.procedures, opts);
        // }

        return context.response;
    } catch (err: any | RpcError | Error) {
        return Promise.reject(err);
    }
}

const compiledExecutionPaths: Map<string, JitFn<compileExecutionPathFn>> = new Map();

export function getCompiledExecutionPath(path: string, executables: Procedure[]): JitFn<compileExecutionPathFn> {
    let jitFn = compiledExecutionPaths.get(path);
    if (!jitFn) {
        jitFn = jitCompileExecutionPath(executables);
        compiledExecutionPaths.set(path, jitFn);
    }
    return jitFn;
}

export function getEmptyCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: string,
    rawRequest: unknown,
    reqHeaders: Headers,
    respHeaders: Headers
): CallContext {
    const transformedPath = opts.pathTransform ? opts.pathTransform(rawRequest, path) : path;
    return {
        path: transformedPath,
        request: {
            headers: reqHeaders,
            rawBody: reqRawBody,
            body: {},
            internalErrors: [],
        },
        response: {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: respHeaders,
            body: {},
            rawBody: '',
        },
        shared: opts.sharedDataFactory ? opts.sharedDataFactory() : {},
    };
}

// ############# PRIVATE METHODS #############

async function runExecutionPath(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executables: Procedure[],
    opts: RouterOptions
): Promise<MionResponse> {
    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (context.response.hasErrors && !executable.options.runOnError) continue;

        try {
            // this code could be simplified but having it like this give us a better idea how to JIT compile it.
            // JIT compilation mostly consist of removing the if/else and instead just emit the required code depending on executable and options
            if (executable.type === ProcedureType.rawHook) {
                const resp = executable.handler(context, rawRequest, rawResponse, opts);
                if (resp instanceof Error || resp instanceof RpcError) throw resp;
                if (isPromise(resp)) await resp;
            } else if (executable.type === ProcedureType.headerHook) {
                const params = deserializeHeaderParams(context.request, executable as HeaderProcedure);
                if (executable.options.validateParams) validateParametersOrThrow(params, executable as NonRawProcedure);
                const resp = executable.handler(context, ...params);

                let result;
                if (isPromise(resp)) result = await resp;
                else result = resp;
                if (result instanceof Error || result instanceof RpcError) throw result;
                if (executable.options.hasReturnData && result !== undefined)
                    serializeHeaderResponse(executable as HeaderProcedure, context.response, result);
            } else {
                const params = deserializeBodyParams(context.request, executable as NonRawProcedure);
                if (executable.options.validateParams) validateParametersOrThrow(params, executable as NonRawProcedure);
                const resp = executable.handler(context, ...params);

                let result;
                if (isPromise(resp)) result = await resp;
                else result = resp;
                if (result instanceof Error || result instanceof RpcError) throw result;
                if (executable.options.hasReturnData && result !== undefined)
                    serializeBodyResponse(executable as NonRawProcedure, context.response, result);
            }
        } catch (err: any | RpcError | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, context.request, context.response, err, i);
        }
    }
    return context.response;
}

// TODO atm header params only allows HEaderValue that is a string so we might not need to deserialize them
function deserializeHeaderParams(request: MionRequest, executable: HeaderProcedure): any[] {
    const headerParams = executable.headerNames.map((name) => request.headers.get(name));
    const params = executable.options.deserializeParams ? deserializeParameters(headerParams, executable) : headerParams;
    return params;
}

function deserializeBodyParams(request: MionRequest, executable: NonRawProcedure): any[] {
    if (!executable.options.deserializeParams) return request.body[executable.id] || [];
    return deserializeParameters(request.body[executable.id] || [], executable);
}

function deserializeParameters(params: any, executable: NonRawProcedure): any[] {
    try {
        return executable.paramsJitFns.jsonDecode.fn(params);
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
            originalError: e,
            errorData: {deserializeError: e.message},
        });
    }
}

function validateParametersOrThrow(params: any[], executable: NonRawProcedure): void {
    const areParamsValid = executable.paramsJitFns.isType.fn(params);
    if (!areParamsValid) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Validation Error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: executable.paramsJitFns.typeErrors.fn(params),
        });
    }
}

function serializeHeaderResponse(executable: HeaderProcedure, response: MionResponse, result: any) {
    const shouldEncode = executable.options.deserializeParams;
    const serialized: HeadersRecord = shouldEncode ? executable.returnJitFns.jsonEncode.fn(result) : result;
    Object.entries(serialized).forEach(([name, value]) => response.headers.set(name, value as string));
}

function serializeBodyResponse(executable: NonRawProcedure, response: MionResponse, result: any) {
    const shouldEncode = executable.options.deserializeParams;
    const serialized = shouldEncode ? executable.returnJitFns.jsonEncode.fn(result) : result;
    (response.body as Mutable<AnyObject>)[executable.id] = serialized;
}

// ############# JIT DISPATCH COMPILATION #############

// function handleProcedureError(step: number, context: CallContext, executable: Procedure, err: any | RpcError | Error) {
//     console.log('Error in step', step, 'of', context.path, 'error:', err);
//     const path = isNotFoundExecutable(executable) ? context.path : executable.id;
//     handleRpcErrors(path, context.request, context.response, err, step);
// }

function jitDeserializeHeaderParams(step: number, paramsVarName: string, execName: string, executable: HeaderProcedure): string {
    const headerVarName = `headerParams${step}`;
    const deserializeCode = executable.options.deserializeParams
        ? `_deserializeParameters(${headerVarName}, ${execName}, ${execName}.id)`
        : `${headerVarName}`;
    return `
        const ${headerVarName} = ${execName}.headerNames.map((name) => context.request.headers.get(name));
        const ${paramsVarName} = ${deserializeCode};
    `;
}

function jitDeserializeBodyParams(step: number, paramsVarName: string, execName: string, executable: NonRawProcedure) {
    if (!executable.options.deserializeParams) return `const ${paramsVarName} = context.request.body[${execName}.id] || [];`;
    return `const ${paramsVarName} = _deserializeParameters(context.request.body[${execName}.id] || [], ${execName}, ${execName}.id);`;
}

function jitSerializeBodyResponse(step: number, resultVarName: string, execName: string, executable: NonRawProcedure) {
    const serializedCode = executable.options.deserializeParams
        ? `${execName}.returnJitFns.jsonEncode.fn(${resultVarName})`
        : `${resultVarName}`;
    return `context.response.body[${execName}.id] = ${serializedCode};`;
}

function jitSerializeHeaderResponse(step: number, resultVarName: string, execName: string, executable: NonRawProcedure) {
    const shouldEncode = executable.options.deserializeParams;
    const serializedVarName = `serialized${step}`;
    const serializedCode = shouldEncode
        ? `const ${serializedVarName} = ${execName}.returnJitFns.jsonEncode.fn(${resultVarName})`
        : `const ${serializedVarName} = ${resultVarName}`;

    return `
        ${serializedCode};
        ${execName}.headerNames.forEach((name, i) => context.response.headers.set(name, ${serializedVarName}?.[i]));
    `;
}

function jitStepRawHookExecution(step: number, resultVarName: string, execName: string, executable: RawProcedure) {
    const awaitCode = executable.options.isAsync ? `await ${resultVarName};` : '';
    return `
        const ${resultVarName} = ${execName}.handler(context, rawRequest, rawResponse, opts);
        if (${resultVarName} instanceof Error || ${resultVarName} instanceof RpcError) throw ${resultVarName};
        ${awaitCode}
    `;
}

function jitStepHeaderHookExecution(
    step: number,
    paramsVarName: string,
    resultVarName: string,
    execName: string,
    executable: HeaderProcedure
) {
    const deserializeParamsCode = jitDeserializeHeaderParams(step, paramsVarName, execName, executable);
    const validateCode = executable.options.validateParams ? `validateParametersOrThrow(${paramsVarName}, ${execName});` : '';
    const await = executable.options.isAsync ? 'await' : '';
    const callCode = `const ${resultVarName} = ${await} ${execName}.handler(context, ...(${paramsVarName}));`;
    const errorThrowCode = `if (${resultVarName} instanceof Error || ${resultVarName} instanceof RpcError) throw ${resultVarName};`;
    const serializedRespCode = jitSerializeHeaderResponse(step, resultVarName, execName, executable);
    return `
        ${deserializeParamsCode}
        ${validateCode}
        ${callCode}
        ${errorThrowCode}
        ${serializedRespCode}
    `;
}

function jitStepRouteHookExecution(
    step: number,
    paramsVarName: string,
    resultVarName: string,
    execName: string,
    executable: RouteProcedure | HookProcedure
) {
    const deserializeParamsCode = jitDeserializeBodyParams(step, paramsVarName, execName, executable);
    const validateCode = executable.options.validateParams ? `validateParametersOrThrow(${paramsVarName}, ${execName});` : '';
    const await = executable.options.isAsync ? 'await' : '';
    const callCode = `const ${resultVarName} = ${await} ${execName}.handler(context, ...(${paramsVarName}));`;
    const errorThrowCode = `if (${resultVarName} instanceof Error || ${resultVarName} instanceof RpcError) throw ${resultVarName};`;
    const serializedRespCode = jitSerializeBodyResponse(step, resultVarName, execName, executable);
    return `
        ${deserializeParamsCode}
        ${validateCode}
        ${callCode}
        ${errorThrowCode}
        ${serializedRespCode}
    `;
}

function jitRunExecutionPathStep(step: number, executable: Procedure) {
    const paramsVarName = `params${step}`;
    const resultVarName = `result${step}`;
    const execName = `executable${step}`;
    let stepCode = '';
    switch (executable.type) {
        case ProcedureType.rawHook:
            stepCode = jitStepRawHookExecution(step, resultVarName, execName, executable as RawProcedure);
            break;
        case ProcedureType.headerHook:
            stepCode = jitStepHeaderHookExecution(step, paramsVarName, resultVarName, execName, executable as HeaderProcedure);
            break;
        default:
            stepCode = jitStepRouteHookExecution(step, paramsVarName, resultVarName, execName, executable as RouteProcedure);
            break;
    }
    return `
        const ${execName} = executables[${step}];
        try {
            if (!context.response.hasErrors || ${execName}.options.runOnError) {
                ${stepCode}
            }
        } catch (err) {
            handleProcedureError(${step}, context, ${execName}, err);
        }
    `;
}

function JitRunExecutionPath(executables: Procedure[]): string {
    let code = '';
    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        code += jitRunExecutionPathStep(i, executable);
    }
    return code;
}

const AsyncFunction = async function () {}.constructor;

type compileExecutionPathFn = (
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executables: Procedure[],
    opts: RouterOptions,
    handleProcedureError,
    validateParametersOrThrow,
    deserializeParameters,
    ProcedureType,
    RpcError
) => string;

function jitCompileExecutionPath(executables: Procedure[]): JitFn<compileExecutionPathFn> {
    const varNames = [
        'context',
        'rawRequest',
        'rawResponse',
        'executables',
        'opts',
        'handleProcedureError',
        'validateParametersOrThrow',
        'deserializeParameters',
        'ProcedureType',
        'RpcError',
    ];
    const code = JitRunExecutionPath(executables);
    return {
        varNames,
        code,
        fn: AsyncFunction(...varNames, code) as compileExecutionPathFn,
    };
}
