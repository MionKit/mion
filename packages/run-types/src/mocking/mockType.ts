/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {MockOptions, Mutable, RunTypeOptions} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import {mockString, mockNumber, mockBoolean, mockBigInt, mockDate, random, mockRegExp, mockSymbol, mockAny} from './mockUtils';
import {stringCharSet} from './constants.mock';
import {ClassRunType} from '../runType/collection/class';
import type {PropertyRunType} from '../runType/member/property';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {TupleRunType} from '../runType/collection/tuple';
import type {FunctionParamsRunType} from '../runType/collection/functionParams';
import type {UnionRunType} from '../runType/collection/union';
import type {EnumRunType} from '../runType/atomic/enum';
import type {PromiseRunType} from '../runType/native/promise';
import type {ParameterRunType} from '../runType/member/param';
import type {RestParamsRunType} from '../runType/member/restParams';
import {ReflectionSubKind} from '../constants.kind';
import {NonSerializableRunType} from '../runType/native/nonSerializable';
import {IndexSignatureRunType} from '../runType/member/indexProperty';
import {getRunTypeFormatter, getRunTypeTransformers} from '../lib/formats';
import {JIT_STACK_TRACE_MESSAGE} from '../constants';
import {JitFunctions} from '../constants.functions';
import type {ArrayRunType} from '../runType/member/array';
import {jitUtils} from '@mionkit/core';
import {MockJitCompiler, type JitCompiler} from '../lib/jitFnCompiler';

export function mockType(runType: BaseRunType, comp: JitCompiler, stack: BaseRunType[] = []): any {
    // TODO: we could use JitCompiler functionality here to controls the stack etc
    stack.push(runType);
    const mockNestLevel = stack.filter((rt) => rt === runType).length;
    const rtOpts = comp.opts;
    const updatedOps = mockNestLevel ? getMockOptionsForNestedElements(rtOpts, mockNestLevel) : comp.opts;
    (comp as Mutable<JitCompiler>).opts = updatedOps;
    // Just one type validator allowed per type, and is responsible to mock the value,
    // ie: email and uuid should contain the logic to generate a valid value
    const typeValidator = getRunTypeFormatter(runType);
    let mocked = typeValidator ? typeValidator.mock(updatedOps, runType) : _mockType(runType, comp, stack);
    (comp as Mutable<JitCompiler>).opts = rtOpts;
    // once mocked multiple type transformers can be applied to the mocked value
    const typeTransformers = getRunTypeTransformers(runType);
    if (typeTransformers.length) {
        const compiledFormatters = typeTransformers
            .filter((t) => !!t.visitFormat)
            .map(() => runType.createJitCompiledFunction(JitFunctions.format.id));
        const formatters = compiledFormatters.filter((c) => !c.isNoop).map((c) => c.fn);
        mocked = formatters.reduce((acc, format) => format(acc), mocked);
    }
    stack.pop();
    return mocked;
}

// reduces all probabilities within the MockOptions to prevent infinite loops
// each time mocking is a level deeper, the probabilities to generate an optional property should be reduced
// this does not prevent infinite loops on types with circular references that are non optional,
// we probably should throw an error in this case but these kind of types are technically not possible in real world so we can ignore them for now
function getMockOptionsForNestedElements(opts: RunTypeOptions, nestLevel: number): RunTypeOptions {
    const mOps = opts.mock as MockOptions;
    const maxDepth = mOps.maxMockRecursion;
    const divisor = nestLevel;
    const {optionalProbability, maxRandomItemsLength: maxRandomArrayLength, optionalPropertyProbability, arrayLength} = mOps;
    const newProv = nestLevel >= maxDepth ? 0 : optionalProbability / divisor;
    const newMaxLength = nestLevel >= maxDepth ? 0 : Math.round(maxRandomArrayLength / divisor);
    // console.log(`divisor: ${divisor} | newMaxLength: ${newMaxLength} | newProv: ${newProv}`);
    const ret = {
        mock: {
            ...mOps,
            optionalProbability: newProv,
            maxRandomItemsLength: newMaxLength,
        },
    } satisfies RunTypeOptions;
    if (optionalPropertyProbability) {
        const entries = Object.entries(optionalPropertyProbability).map(([key, value]) => {
            const newProv = nestLevel > maxDepth ? 0 : value / divisor;
            return [key, value / newProv];
        });
        ret.mock.optionalPropertyProbability = Object.fromEntries(entries);
    }
    if (arrayLength) {
        const newLength = nestLevel >= maxDepth ? 0 : Math.round(arrayLength / divisor);
        ret.mock.arrayLength = newLength;
    }
    if (ret.mock.parentObj) ret.mock.parentObj = {}; // prevents mocking objects with circular references
    return ret;
}

/**
 * Centralized mock function with a giant switch statement that handles all node types.
 * This function is similar to createRunType in runType.ts but for mocking.
 */
function _mockType(runType: BaseRunType, comp: JitCompiler, stack: BaseRunType[]): any {
    // Handle circular references
    const mOps = comp.opts.mock as MockOptions;
    const recursionLevel = stack.filter((rt) => rt === runType).length;
    const src = runType.src;
    const kind = src.kind;
    if (recursionLevel > mOps.maxMockRecursion) return undefined;

    switch (kind) {
        case ReflectionKind.never:
            throw new Error('Cannot mock never type.' + printStackTrace(comp, stack));
        case ReflectionKind.any:
        case ReflectionKind.unknown:
            return mockAny(mOps.anyValuesList);
        // Atomic types
        case ReflectionKind.string:
            return mockString(mOps.stringLength || random(1, mOps.maxRandomStringLength), mOps.stringCharSet || stringCharSet);
        case ReflectionKind.number:
            return mockNumber(mOps.minNumber, mOps.maxNumber);
        case ReflectionKind.boolean:
            return mockBoolean();
        case ReflectionKind.bigint:
            return mockBigInt(mOps.minNumber, mOps.maxNumber);
        case ReflectionKind.null:
            return null;
        case ReflectionKind.undefined:
            return undefined;
        case ReflectionKind.void:
            return undefined;
        case ReflectionKind.regexp:
            return mockRegExp(mOps.regexpList);
        case ReflectionKind.symbol:
            return mockSymbol(mOps.symbolName, mOps.symbolLength, mOps.symbolCharSet);
        case ReflectionKind.literal:
            return src.literal;
        case ReflectionKind.object:
            return mOps.objectList[random(0, mOps.objectList.length - 1)];
        case ReflectionKind.enum: {
            const rt = runType as EnumRunType;
            const i = mOps.enumIndex || random(0, rt.src.values.length - 1);
            return rt.src.values[i];
        }
        case ReflectionKind.enumMember:
            throw new Error('Mock enum member is not supported.' + printStackTrace(comp, stack));
        // Collection types
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
            if (length === 0) return [];
            return Array.from({length}, () => mockType(rt.getMemberType(), comp, stack));
        }

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const options = mOps.tupleOptions;
            const params = rt.getChildRunTypes().map((p, i) => mockType(p, getChildOpts(comp, options?.[i]), stack));
            if (rt.hasRestParameter(comp)) {
                return [...params.slice(0, -1), ...params[params.length - 1]];
            }
            return params;
        }
        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral: {
            if (runType instanceof NonSerializableRunType) {
                throw new Error(`Mock is disabled for Non Serializable types.` + printStackTrace(comp, stack));
            } else {
                const rt = runType as InterfaceRunType;
                if (rt.isCallable()) return mockType(rt.getCallSignature()!, comp, stack);
                let obj: Record<string | number, any> = mOps.parentObj || {};
                rt.getChildRunTypes().forEach((prop) => {
                    if (prop instanceof IndexSignatureRunType) {
                        obj = {...obj, ...mockType(prop, comp, stack)};
                        return;
                    }
                    const name = (prop as PropertyRunType).getChildVarName(comp);
                    const isMethod = prop.src.kind === ReflectionKind.method || prop.src.kind === ReflectionKind.methodSignature;
                    if (isMethod) return; // skip mocking methods
                    obj[name] = mockType(prop, comp, stack);
                });
                return obj;
            }
        }
        case ReflectionKind.class:
            return _mockClass(runType, comp, stack);
        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            if (mOps.unionIndex && (mOps.unionIndex < 0 || mOps.unionIndex >= rt.getChildRunTypes().length)) {
                throw new Error(
                    'unionIndex must be between 0 and the number of types in the union.' + printStackTrace(comp, stack)
                );
            }
            const index = mOps?.unionIndex ?? random(0, rt.getChildRunTypes().length - 1);
            return mockType(rt.getChildRunTypes()[index], comp, stack);
        }

        case ReflectionKind.function:
        case ReflectionKind.callSignature:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                const rt = runType as FunctionParamsRunType;
                const options = mOps.tupleOptions;
                const params = rt.getParamRunTypes(comp).map((p, i) => mockType(p, getChildOpts(comp, options?.[i]), stack));
                if (rt.hasRestParameter(comp)) {
                    return [...params.slice(0, -1), ...params[params.length - 1]];
                }
                return params;
            } else if (runType.src.kind === ReflectionKind.method || runType.src.kind === ReflectionKind.methodSignature) {
                return undefined; // Skip methods silently
            } else {
                throw new Error('Mock is not allowed, call mockParams or mockReturn instead.' + printStackTrace(comp, stack));
            }
        case ReflectionKind.promise: {
            const rt = runType as PromiseRunType;
            const timeOut = mOps.promiseTimeOut || 1;
            return new Promise((resolve, reject) => {
                if (timeOut > 0) {
                    setTimeout(() => {
                        if (mOps.promiseReject) reject(mOps.promiseReject);
                        else resolve(mockType(rt.getMemberType(), comp, stack));
                    }, timeOut);
                    return;
                }
                if (mOps.promiseReject) reject(mOps.promiseReject);
                else resolve(mockType(rt.getMemberType(), comp, stack));
            });
        }
        // Member types
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            if (!rt.getJitChild(comp)) return undefined; // non serializable types are set to undefined
            if (rt.isOptional() && !rt.isRest()) {
                const probability = mOps.optionalProbability;
                if (probability < 0 || probability > 1)
                    throw new Error('optionalProbability must be between 0 and 1' + printStackTrace(comp, stack));
                if (Math.random() > probability) {
                    return undefined;
                }
            }
            return mockType(rt.getMemberType(), comp, stack);
        }
        case ReflectionKind.propertySignature:
        case ReflectionKind.property: {
            const rt = runType as PropertyRunType;
            const probability = mOps.optionalPropertyProbability?.[rt.getChildVarName(comp)] ?? mOps.optionalProbability;
            if (probability < 0 || probability > 1)
                throw new Error('optionalProbability must be between 0 and 1' + printStackTrace(comp, stack));
            if (rt.src.optional && Math.random() > probability) return undefined;
            return mockType(rt.getMemberType(), comp, stack);
        }

        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            const length = random(0, mOps.maxRandomItemsLength);
            const items: any[] = [];
            for (let i = 0; i < length; i++) {
                items.push(mockType(rt.getMemberType(), comp, stack));
            }
            return items;
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const length = random(0, mOps.maxRandomItemsLength);
            const parentObj = mOps.parentObj || {};
            for (let i = 0; i < length; i++) {
                let propName: number | string | symbol;
                switch (true) {
                    case !!(rt.src.index.kind === ReflectionKind.number):
                        propName = i;
                        break;
                    case !!(rt.src.index.kind === ReflectionKind.string):
                        propName = `key${i}`;
                        break;
                    case !!(rt.src.index.kind === ReflectionKind.symbol):
                        propName = Symbol.for(`key${i}`);
                        break;
                    default:
                        throw new Error('Invalid index signature type.');
                }
                parentObj[propName] = mockType(rt.getMemberType(), comp, stack);
            }
            return parentObj;
        }

        case ReflectionKind.infer:
        case ReflectionKind.templateLiteral:
        case ReflectionKind.typeParameter:
        default:
            throw new Error(`Cant mock Unsupported RunType: ${runType.getTypeName()}` + printStackTrace(comp, stack));
    }
}

function _mockClass(runType: BaseRunType, comp: JitCompiler, stack: BaseRunType[]) {
    const mOps = comp.opts.mock as MockOptions;
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return mockDate(mOps.minDate, mOps.maxDate);
        case ReflectionSubKind.map: {
            const rt = runType as MapRunType;
            const mockMap = new Map();
            const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
            for (let i = 0; i < length; i++) {
                const keyType = mockType(rt.keyRT, comp, stack);
                const valueType = mockType(rt.valueRT, comp, stack);
                mockMap.set(keyType, valueType);
            }
            return mockMap;
        }
        case ReflectionSubKind.set: {
            const rt = runType as SetRunType;
            const mockSet = new Set();
            const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
            for (let i = 0; i < length; i++) {
                const value = mockType(rt.keyRT, comp, stack);
                mockSet.add(value);
            }
            return mockSet;
        }
        case ReflectionSubKind.nonSerializable:
            throw new Error(`Mock is disabled for Non Serializable types.` + printStackTrace(comp, stack));
        default: {
            if (!(runType instanceof ClassRunType)) {
                throw new Error(`Cant mock Unsupported RunType: ${runType.getTypeName()}` + printStackTrace(comp, stack));
            }
            const rt = runType as ClassRunType;
            const isSerializable = rt.isClassWithEmptyConstructor();
            const deserializeFn = jitUtils.getDeserializeFn(rt.getClassName());
            if (!deserializeFn && !isSerializable) {
                throw new Error(
                    `Class ${rt.getClassName()} can not be mocked. Be sure to register a deserialize function first with jiUtils.${jitUtils.setDeserializeFn.name}` +
                        printStackTrace(comp, stack)
                );
            }
            const instance = deserializeFn ? {} : new rt.src.classType();
            // only properties that are used in jit operations are mocked, there properties should be initialized in the constructor
            rt.getJitChildren(comp).forEach((prop) => {
                const name = (prop as PropertyRunType).getChildVarName(comp);
                if (prop instanceof IndexSignatureRunType) mockType(prop, comp, stack);
                const mocked = mockType(prop, comp, stack);
                if ((prop as PropertyRunType).src.optional && mocked === undefined) return;
                instance[name] = mockType(prop, comp, stack);
            });
            if (deserializeFn) return deserializeFn(instance);
            if (isSerializable) return instance;
            throw new Error(`Class ${rt.getClassName()} can not be mocked.` + printStackTrace(comp, stack));
        }
    }
}

function getChildOpts(comp: JitCompiler, mockOpts?: MockOptions): JitCompiler {
    if (!mockOpts) return comp;
    const newOpts = {...comp.opts, mock: mockOpts};
    return new MockJitCompiler(comp.rootType, newOpts, comp, comp.jitFnHash, comp.typeID);
}

function printStackTrace(comp: JitCompiler, stack: BaseRunType[]) {
    const separator = '.';
    return JIT_STACK_TRACE_MESSAGE + stack.map((rt) => comp.getTypeTraceInfo(rt)).join(separator);
}
