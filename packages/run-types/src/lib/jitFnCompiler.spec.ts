/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {JitFunctions} from '../constants.functions';
import {runType} from './createRunType';
import {JitCompiledFnData, PureFunctionData} from '@mionkit/core';

interface PublicMethod {
    id: string;
    type: string;
    headerNames?: string[];
    paramNames?: string[];
    handler: () => void;
    paramsJitHashes: Record<string, string>;
    returnJitHashes: Record<string, string>;
    hookIds?: string[];
    pathPointers?: string[][];
}

// data structure containing all JitCompiledFnData and PureFunctionData
interface MethodsData {
    methods: Record<string, PublicMethod>;
    deps: Record<string, JitCompiledFnData>;
    purFnDeps: Record<string, PureFunctionData>;
}

type MethodsResponse = MethodsData | RpcError<string>;

const methodsData = mockData();
const restoredMethodsData = mockData(true);

// ensure JitFunctions can be serialized (this is used in the router when sending the methods metadata to the client)
describe('JitCompiler', () => {
    it('validate', () => {
        const rt = runType<MethodsData>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(methodsData)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<MethodsData>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(methodsData)).toEqual([]);
    });

    it('toJsonVal / fromJsonVal', () => {
        const rt = runType<MethodsData>();
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const clone = mockData();
        const jsonString = JSON.stringify(toJsonVal(clone));
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });

    it('jsonStringify', () => {
        const rt = runType<MethodsData>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const clone = mockData();
        const jsonString = jsonStringify(clone);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });
});

describe('JitCompiler on union', () => {
    it('isType', () => {
        const rt = runType<MethodsResponse>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'}))).toBe(true);
        expect(isType(methodsData)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<MethodsResponse>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'}))).toEqual([]);
        expect(typeErrors(methodsData)).toEqual([]);
    });

    it('toJsonVal /fromJsonVal', () => {
        const rt = runType<MethodsResponse>();
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);

        const rpcError = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'});
        const rpcErrorClone = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'});
        const jsonStringRpcError = JSON.stringify(toJsonVal(rpcErrorClone));
        const restoredRpcError = fromJsonVal(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const methodsDataClone = mockData();
        const jsonStringMethodsData = JSON.stringify(toJsonVal(methodsDataClone));
        const restoredMethodsData = fromJsonVal(JSON.parse(jsonStringMethodsData));
        expect(restoredMethodsData).toEqual(restoredMethodsData);
    });

    it('jsonStringify', () => {
        const rt = runType<MethodsResponse>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const rpcError = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'});
        const rpcErrorClone = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', message: 'error'});
        const jsonStringRpcError = jsonStringify(rpcErrorClone);
        const restoredRpcError = fromJsonVal(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const clone = mockData();
        const jsonString = jsonStringify(clone);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });
});

function mockData(isRestored?: boolean): MethodsData {
    const publicMethod1: PublicMethod = {
        id: 'method1',
        type: 'route',
        // restored date does not restore functions,
        // in the router an client extra step will be done to restore them,
        // the handler in the client will contains the logic to call the handler in the server
        ...(isRestored ? ({} as any) : {handler: () => 'something'}),
        paramsJitHashes: {
            isType: 'isType',
            typeErrors: 'typeErrors',
            toJsonVal: 'toJsonVal',
            fromJsonVal: 'fromJsonVal',
            jsonStringify: 'jsonStringify',
        },
        returnJitHashes: {
            isType: 'isType',
            typeErrors: 'typeErrors',
            toJsonVal: 'toJsonVal',
            fromJsonVal: 'fromJsonVal',
            jsonStringify: 'jsonStringify',
        },
    };
    const compiledFnData1: JitCompiledFnData = {
        typeName: 'string',
        fnID: JitFunctions.isType.id,
        jitFnHash: 'isType',
        args: {vλl: 'v', θpts: 'opts', εrr: 'er'},
        defaultParamValues: {vλl: '', θpts: '{}', εrr: '[]'},
        code: 'function isType(v) {return typeof v === "string";} return isType;',
        dependenciesSet: new Set<string>(),
        pureFnDependencies: new Set<string>(),
    };
    const compiledFnData2: JitCompiledFnData = {
        typeName: 'string',
        fnID: JitFunctions.toJsonVal.id,
        jitFnHash: 'toJsonVal',
        args: {vλl: 'v', θpts: 'opts', εrr: 'er', someOther: 'so'},
        defaultParamValues: {vλl: '', θpts: '{}', εrr: '[]', someOther: ''},
        code: 'function toJsonVal(v) {return v;} return toJsonVal;',
        dependenciesSet: new Set<string>(),
        pureFnDependencies: new Set<string>(['addNumbers']),
    };
    const pureFunctionData1: PureFunctionData = {
        paramNames: ['a', 'b'],
        code: 'function addNumbers(a, b) {return a + b;} return addNumbers;',
        pureFnHash: 'addNumbers',
        dependencies: new Set<string>(),
    };
    const pureFunctionData2: PureFunctionData = {
        paramNames: ['a', 'b'],
        code: 'function multiplyNumbers(a, b) {return a * b;} return multiplyNumbers;',
        pureFnHash: 'multiplyNumbers',
        dependencies: new Set<string>(['addNumbers']),
    };
    const md: MethodsData = {
        methods: {
            method1: publicMethod1,
        },
        deps: {
            isType: compiledFnData1,
            toJsonVal: compiledFnData2,
        },
        purFnDeps: {
            addNumbers: pureFunctionData1,
            multiplyNumbers: pureFunctionData2,
        },
    };
    return md;
}
