/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {JitFunctions} from '../constants.functions';
import {runType} from '../createRunType';
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

    it('prepareForJson / restoreFromJson', () => {
        const rt = runType<MethodsData>();
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = JSON.stringify(prepareForJson(clone));
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });

    it('jsonStringify', () => {
        const rt = runType<MethodsData>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = jsonStringify(clone);
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });
});

describe('JitCompiler on union', () => {
    it('isType', () => {
        const rt = runType<MethodsResponse>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'}))).toBe(true);
        expect(isType(methodsData)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<MethodsResponse>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(
            typeErrors(new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'}))
        ).toEqual([]);
        expect(typeErrors(methodsData)).toEqual([]);
    });

    it('prepareForJson /restoreFromJson', () => {
        const rt = runType<MethodsResponse>();
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);

        const rpcError = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'});
        const rpcErrorClone = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'});
        const jsonStringRpcError = JSON.stringify(prepareForJson(rpcErrorClone));
        const restoredRpcError = restoreFromJson(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const methodsDataClone = mockData();
        const jsonStringMethodsData = JSON.stringify(prepareForJson(methodsDataClone));
        const restoredMethodsData = restoreFromJson(JSON.parse(jsonStringMethodsData));
        expect(restoredMethodsData).toEqual(restoredMethodsData);
    });

    it('jsonStringify', () => {
        const rt = runType<MethodsResponse>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);

        const rpcError = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'});
        const rpcErrorClone = new RpcError({type: 'error', statusCode: 400, publicMessage: 'error', publicMessage: 'error'});
        const jsonStringRpcError = jsonStringify(rpcErrorClone);
        const restoredRpcError = restoreFromJson(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const clone = mockData();
        const jsonString = jsonStringify(clone);
        const restored = restoreFromJson(JSON.parse(jsonString));
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
            prepareForJson: 'prepareForJson',
            restoreFromJson: 'restoreFromJson',
            jsonStringify: 'jsonStringify',
        },
        returnJitHashes: {
            isType: 'isType',
            typeErrors: 'typeErrors',
            prepareForJson: 'prepareForJson',
            restoreFromJson: 'restoreFromJson',
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
        fnID: JitFunctions.prepareForJson.id,
        jitFnHash: 'prepareForJson',
        args: {vλl: 'v', θpts: 'opts', εrr: 'er', someOther: 'so'},
        defaultParamValues: {vλl: '', θpts: '{}', εrr: '[]', someOther: ''},
        code: 'function prepareForJson(v) {return v;} return prepareForJson;',
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
            prepareForJson: compiledFnData2,
        },
        purFnDeps: {
            addNumbers: pureFunctionData1,
            multiplyNumbers: pureFunctionData2,
        },
    };
    return md;
}
