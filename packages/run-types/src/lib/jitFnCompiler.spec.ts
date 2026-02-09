/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, MethodWithOptions, MethodsCache, RpcError, SerializableMethodsData} from '@mionkit/core';
import {JitFunctions} from '../constants.functions';
import {runType} from '../createRunType';
import {JitCompiledFnData, PureFunctionData} from '@mionkit/core';

type MethodsResponse = SerializableMethodsData | RpcError<string>;

// ensure JitFunctions can be serialized (this is used in the router when sending the methods metadata to the client)

describe('MethodsCache JitCompiler', () => {
    const methodsData = mockData();
    const restoredMethodsData = mockData();
    it('validate', () => {
        const rt = runType<MethodsCache>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(methodsData.methods)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<MethodsCache>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(methodsData.methods)).toEqual([]);
    });

    it('prepareForJson / restoreFromJson', () => {
        const rt = runType<MethodsCache>();
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = JSON.stringify(prepareForJson(clone.methods));
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData.methods);
    });

    it('stringifyJson', () => {
        const rt = runType<MethodsCache>();
        const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = stringifyJson(clone.methods);
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData.methods);
    });
});

describe('SerializableMethodsData JitCompiler', () => {
    const methodsData = mockData();
    const restoredMethodsData = mockData();
    it('validate', () => {
        const rt = runType<SerializableMethodsData>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(methodsData)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<SerializableMethodsData>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(methodsData)).toEqual([]);
    });

    it('prepareForJson / restoreFromJson', () => {
        const rt = runType<SerializableMethodsData>();
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = JSON.stringify(prepareForJson(clone));
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });

    it('stringifyJson', () => {
        const rt = runType<SerializableMethodsData>();
        const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const clone = mockData();
        const jsonString = stringifyJson(clone);
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });
});

describe('MethodsResponse JitCompiler on union', () => {
    const methodsData = mockData();
    const restoredMethodsData = mockData();

    it('isType', () => {
        const rt = runType<MethodsResponse>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'}))).toBe(true);
        expect(isType(methodsData)).toBe(true);
    });

    it('typeErrors', () => {
        const rt = runType<MethodsResponse>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'}))).toEqual([]);
        expect(typeErrors(methodsData)).toEqual([]);
    });

    it('prepareForJson /restoreFromJson', () => {
        const rt = runType<MethodsResponse>();
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);

        const rpcError = new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'});
        const rpcErrorClone = new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'});
        const jsonStringRpcError = JSON.stringify(prepareForJson(rpcErrorClone));
        const restoredRpcError = restoreFromJson(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const methodsDataClone = mockData();
        const jsonStringMethodsData = JSON.stringify(prepareForJson(methodsDataClone));
        const restoredMethodsData = restoreFromJson(JSON.parse(jsonStringMethodsData));
        expect(restoredMethodsData).toEqual(restoredMethodsData);
    });

    it('stringifyJson', () => {
        const rt = runType<MethodsResponse>();
        const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);

        const rpcError = new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'});
        const rpcErrorClone = new RpcError({type: 'test-error', publicMessage: 'error', message: 'error'});
        const jsonStringRpcError = stringifyJson(rpcErrorClone);
        const restoredRpcError = restoreFromJson(JSON.parse(jsonStringRpcError));
        expect(restoredRpcError).toEqual(rpcError);

        const clone = mockData();
        const jsonString = stringifyJson(clone);
        const restored = restoreFromJson(JSON.parse(jsonString));
        expect(restored).toEqual(restoredMethodsData);
    });
});

function mockData(): SerializableMethodsData {
    const publicMethod1: MethodWithOptions = {
        id: 'method1',
        type: HandlerType.route,
        isAsync: false,
        hasReturnData: true,
        nestLevel: 0,
        pointer: ['method1'],
        paramsJitHash: 'paramsJitHash',
        returnJitHash: 'returnJitHash',
        options: {runOnError: false, validateParams: true, validateReturn: true, serializer: 'json'},
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
        pureFnDependencies: new Set<string>(['test::addNumbers']),
    };
    const pureFunctionData1: PureFunctionData = {
        namespace: 'test',
        paramNames: ['a', 'b'],
        code: 'function addNumbers(a, b) {return a + b;} return addNumbers;',
        pureFnHash: 'addNumbers',
        dependencies: new Set<string>(),
    };
    const pureFunctionData2: PureFunctionData = {
        namespace: 'test',
        paramNames: ['a', 'b'],
        code: 'function multiplyNumbers(a, b) {return a * b;} return multiplyNumbers;',
        pureFnHash: 'multiplyNumbers',
        dependencies: new Set<string>(['test::addNumbers']),
    };
    const md: SerializableMethodsData = {
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
