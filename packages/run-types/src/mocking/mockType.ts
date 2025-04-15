/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {MockOperation, MockOptions} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import {mockString, mockNumber, mockBoolean, mockBigInt, mockDate, mockAny, random, mockRegExp, mockSymbol} from './mockUtils';
import {defaultMockOptions, stringCharSet} from './constants.mock';
import {ClassRunType} from '../runType/collection/class';
import type {PropertyRunType} from '../runType/member/property';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {TupleRunType} from '../runType/collection/tuple';
import type {UnionRunType} from '../runType/collection/union';
import type {EnumRunType} from '../runType/atomic/enum';
import type {PromiseRunType} from '../runType/native/promise';
import type {ParameterRunType} from '../runType/member/param';
import type {RestParamsRunType} from '../runType/member/restParams';
import {ReflectionSubKind} from '../constants.kind';
import {NonSerializableRunType} from '../runType/native/nonSerializable';
import {IndexSignatureRunType} from '../runType/member/indexProperty';
import {getRunTypeFormatter, getRunTypeTransformers} from '../lib/formats';
import {JitFunctions} from '../constants';
import {isMockContext} from '../lib/guards';

export function mock(runType: BaseRunType, k?: Partial<MockOptions>): any {
    const ctx = initMockOptions(k);
    ctx.stack.push(runType);
    const recursionLevel = ctx.stack.filter((rt) => rt === runType).length;
    const updatedContext = recursionLevel ? onCircularMock(ctx, recursionLevel) : ctx;
    // Just one type validator allowed per type, and is responsible to mock the value,
    // ie: email and uuid should contain the logic to generate a valid value
    const typeValidator = getRunTypeFormatter(runType);
    let mocked = typeValidator ? typeValidator.mock(updatedContext, runType) : _mock(runType, updatedContext);
    // once mocked multiple type transformers can be applied to the mocked value
    const typeTransformers = getRunTypeTransformers(runType);
    if (typeTransformers.length) {
        const compiledFormatters = typeTransformers
            .filter((t) => !!t._compileFormat)
            .map(() => runType.createJitCompiledFunction(JitFunctions.format.id));
        const formatters = compiledFormatters.filter((c) => !c.isNoop).map((c) => c.fn);
        mocked = formatters.reduce((acc, format) => format(acc), mocked);
    }
    ctx.stack.pop();
    return mocked;
}

// reduces all probabilities within the MockOptions to prevent infinite loops
// each time mocking is a level deeper, the probabilities to generate an optional property should be reduced
// this does not prevent infinite loops on types with circular references that are non optional,
// we probably should throw an error in this case but these kind of types are technically not possible in real world so we can ignore them for now
function onCircularMock(ctx: MockOperation, recursionLevel: number): MockOperation {
    const maxDepth = ctx.maxMockRecursion;
    const divisor = recursionLevel;
    const {optionalProbability, maxRandomItemsLength: maxRandomArrayLength, optionalPropertyProbability, arrayLength} = ctx;
    const newProv = recursionLevel >= maxDepth ? 0 : optionalProbability / divisor;
    const newMaxLength = recursionLevel >= maxDepth ? 0 : Math.round(maxRandomArrayLength / divisor);
    // console.log(`divisor: ${divisor} | newMaxLength: ${newMaxLength} | newProv: ${newProv}`);
    const ret: MockOperation = {
        ...ctx,
        optionalProbability: newProv,
        maxRandomItemsLength: newMaxLength,
    };
    if (optionalPropertyProbability) {
        const entries = Object.entries(optionalPropertyProbability).map(([key, value]) => {
            const newProv = recursionLevel > maxDepth ? 0 : value / divisor;
            return [key, value / newProv];
        });
        ret.optionalPropertyProbability = Object.fromEntries(entries);
    }
    if (arrayLength) {
        const newLength = recursionLevel >= maxDepth ? 0 : Math.round(arrayLength / divisor);
        ret.arrayLength = newLength;
    }
    if (ret.parentObj) ret.parentObj = {}; // prevents mocking objects with circular references
    return ret;
}

function initMockOptions(k?: Partial<MockOptions>): MockOperation {
    if (k && isMockContext(k)) return k;
    return {...defaultMockOptions, ...(k || {}), stack: []};
}

/**
 * Centralized mock function with a giant switch statement that handles all node types.
 * This function is similar to createRunType in runType.ts but for mocking.
 */
function _mock(runType: BaseRunType, ctx: MockOperation): any {
    // Handle circular references
    const recursionLevel = ctx.stack.filter((rt) => rt === runType).length;
    if (recursionLevel > ctx.maxMockRecursion) {
        return undefined;
    }

    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        case ReflectionKind.never:
            throw new Error('Cannot mock never type.');
        case ReflectionKind.any:
        case ReflectionKind.unknown:
            return mockAny(ctx.anyValuesList);
        // Atomic types
        case ReflectionKind.string:
            return mockString(ctx.stringLength || random(1, ctx.maxRandomStringLength), ctx.stringCharSet || stringCharSet);
        case ReflectionKind.number:
            return mockNumber(ctx.minNumber, ctx.maxNumber);
        case ReflectionKind.boolean:
            return mockBoolean();
        case ReflectionKind.bigint:
            return mockBigInt(ctx.minNumber, ctx.maxNumber);
        case ReflectionKind.null:
            return null;
        case ReflectionKind.undefined:
            return undefined;
        case ReflectionKind.void:
            return undefined;
        case ReflectionKind.regexp:
            return mockRegExp(ctx.regexpList);
        case ReflectionKind.symbol:
            return mockSymbol(ctx.symbolName, ctx.symbolLength, ctx.symbolCharSet);
        case ReflectionKind.literal:
            return src.literal;
        case ReflectionKind.object:
            return ctx.objectList[random(0, ctx.objectList.length - 1)];
        case ReflectionKind.enum: {
            const rt = runType as EnumRunType;
            const i = ctx.enumIndex || random(0, rt.src.values.length - 1);
            return rt.src.values[i];
        }
        case ReflectionKind.enumMember:
            throw new Error('Mock enum member is not supported.');
        // Collection types
        case ReflectionKind.array: {
            const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
            return Array.from({length}, () => mock((runType as any).getMemberType(), ctx));
        }

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const options = ctx.tupleOptions;
            const params = rt.getChildRunTypes().map((p, i) => mock(p, options?.[i] || ctx));
            if (rt.hasRestParameter()) {
                return [...params.slice(0, -1), ...params[params.length - 1]];
            }
            return params;
        }
        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral: {
            if (runType instanceof NonSerializableRunType) {
                throw new Error(`Mock is disabled for Non Serializable types.`);
            } else {
                const rt = runType as InterfaceRunType;
                if (rt.isCallable()) return mock(rt.getCallSignature()!, ctx as MockOperation);
                let obj: Record<string | number, any> = ctx.parentObj || {};
                rt.getChildRunTypes().forEach((prop) => {
                    const name = (prop as PropertyRunType).getChildVarName();
                    if (prop instanceof IndexSignatureRunType) obj = {...obj, ...mock(prop, ctx as MockOperation)};
                    else obj[name] = mock(prop, ctx as MockOperation);
                });
                return obj;
            }
        }
        case ReflectionKind.class:
            return _mockClass(runType, ctx);
        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            if (ctx.unionIndex && (ctx.unionIndex < 0 || ctx.unionIndex >= rt.getChildRunTypes().length)) {
                throw new Error('unionIndex must be between 0 and the number of types in the union.');
            }
            const index = ctx?.unionIndex ?? random(0, rt.getChildRunTypes().length - 1);
            return mock(rt.getChildRunTypes()[index], ctx);
        }

        case ReflectionKind.function:
        case ReflectionKind.callSignature:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            throw new Error('Mock is not allowed, call mockParams or mockReturn instead.');

        case ReflectionKind.promise: {
            const rt = runType as PromiseRunType;
            const timeOut = ctx.promiseTimeOut || 1;
            return new Promise((resolve, reject) => {
                if (timeOut > 0) {
                    setTimeout(() => {
                        if (ctx.promiseReject) reject(ctx.promiseReject);
                        else resolve(mock(rt.getMemberType(), ctx));
                    }, timeOut);
                    return;
                }
                if (ctx.promiseReject) reject(ctx.promiseReject);
                else resolve(mock(rt.getMemberType(), ctx));
            });
        }
        // Member types
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            if (!rt.getJitChild()) return undefined; // non serializable types are set to undefined
            if (rt.isOptional() && !rt.isRest()) {
                const probability = ctx.optionalProbability;
                if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
                if (Math.random() > probability) {
                    return undefined;
                }
            }
            return mock(rt.getMemberType(), ctx);
        }
        case ReflectionKind.propertySignature:
        case ReflectionKind.property: {
            const rt = runType as PropertyRunType;
            const probability = ctx.optionalPropertyProbability?.[rt.getChildVarName()] ?? ctx.optionalProbability;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (rt.src.optional && Math.random() > probability) return undefined;
            return mock(rt.getMemberType(), ctx);
        }

        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            const length = random(0, ctx.maxRandomItemsLength);
            const items: any[] = [];
            for (let i = 0; i < length; i++) {
                items.push(mock(rt.getMemberType(), ctx));
            }
            return items;
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const length = random(0, ctx.maxRandomItemsLength);
            const parentObj = ctx.parentObj || {};
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
                parentObj[propName] = mock(rt.getMemberType(), ctx);
            }
            return parentObj;
        }

        case ReflectionKind.infer:
        case ReflectionKind.templateLiteral:
        case ReflectionKind.typeParameter:
        default:
            throw new Error(`Cant mock Unsupported RunType: ${runType.getTypeName()}`);
    }
}

function _mockClass(runType: BaseRunType, ctx: MockOperation) {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return mockDate(ctx.minDate, ctx.maxDate);
        case ReflectionSubKind.map: {
            const rt = runType as MapRunType;
            const mockMap = new Map();
            const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
            for (let i = 0; i < length; i++) {
                const keyType = mock(rt.keyRT, ctx);
                const valueType = mock(rt.valueRT, ctx);
                mockMap.set(keyType, valueType);
            }
            return mockMap;
        }
        case ReflectionSubKind.set: {
            const rt = runType as SetRunType;
            const mockSet = new Set();
            const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
            for (let i = 0; i < length; i++) {
                const value = mock(rt.keyRT, ctx);
                mockSet.add(value);
            }
            return mockSet;
        }
        case ReflectionSubKind.nonSerializable:
            throw new Error(`Mock is disabled for Non Serializable types.`);
        default: {
            if (!(runType instanceof ClassRunType)) {
                throw new Error(`Cant mock Unsupported RunType: ${runType.getTypeName()}`);
            }
            const rt = runType as ClassRunType;
            const isSerializable = rt.isSerializableClass();
            if (!isSerializable) {
                throw new Error(
                    `Class ${rt.getClassName()} can not be mocked. Only classes with and empty constructor can be mocked.`
                );
            }
            const instance = new rt.src.classType();
            // only properties that are used in jit operations are mocked, there properties should be initialized in the constructor
            rt.getJitChildren().forEach((prop) => {
                const name = (prop as PropertyRunType).getChildVarName();
                if (prop instanceof IndexSignatureRunType) mock(prop, ctx);
                else instance[name] = mock(prop, ctx as MockOperation);
            });
            return instance;
        }
    }
}
