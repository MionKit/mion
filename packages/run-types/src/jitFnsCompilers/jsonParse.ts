/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFunctions} from '../constants.functions';
import {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {createIfElseFn, childIsExpression} from '@mionkit/run-types/src/lib/utils';
import type {IndexSignatureRunType} from '../runType/member/indexProperty';
import type {jitCode, JitFnID} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {ClassRunType} from '../runType/collection/class';
import type {PropertyRunType} from '../runType/member/property';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {TupleRunType} from '../runType/collection/tuple';
import type {FunctionParamsRunType} from '../runType/collection/functionParams';
import type {UnionRunType} from '../runType/collection/union';
import type {ParameterRunType} from '../runType/member/param';
import type {RestParamsRunType} from '../runType/member/restParams';
import type {ArrayRunType} from '@mionkit/run-types/src/runType/member/array';
import type {LiteralRunType} from '@mionkit/run-types/src/runType/atomic/literal';
import type {IterableRunType} from '@mionkit/run-types/src/runType/native/Iterable';

type Operation = typeof JitFunctions.jsonParse.id;

/** Centralized compile jit function with a switch statement that handles all node types. */
export function _compileJsonParse(runType: BaseRunType, comp: JitCompiler, fnID: Operation = JitFunctions.jsonParse.id): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC RUNTYPES ######################
        // Primitive types and other atomic types that don't contain other types
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            // For unknown/any types, we can't provide type-specific parsing
            // Leave unimplemented as requested for problematic types
            return undefined;
        case ReflectionKind.bigint:
            return `${comp.vλl} = BigInt(${comp.vλl});`;
        case ReflectionKind.boolean:
            return undefined; // JSON booleans map directly, no transformation needed
        case ReflectionKind.enum:
            return undefined; // Enums map directly, no transformation needed
        case ReflectionKind.enumMember:
            throw new Error('JsonParse enum member is not supported.');
        case ReflectionKind.literal: {
            const rt = runType as LiteralRunType;
            if (src.literal instanceof RegExp) return _compileJsonParse({src: {kind: ReflectionKind.regexp}} as any, comp);
            switch (typeof rt.src.literal) {
                case 'number':
                    return _compileJsonParse({src: {kind: ReflectionKind.number}} as any, comp);
                case 'string':
                    return _compileJsonParse({src: {kind: ReflectionKind.string}} as any, comp);
                case 'boolean':
                    return _compileJsonParse({src: {kind: ReflectionKind.boolean}} as any, comp);
                case 'bigint':
                    return _compileJsonParse({src: {kind: ReflectionKind.bigint}} as any, comp);
                case 'symbol':
                    return _compileJsonParse({src: {kind: ReflectionKind.symbol}} as any, comp);
                default:
                    return undefined; // No transformation needed
            }
        }
        case ReflectionKind.never:
            throw new Error('Never type cannot be parsed.');
        case ReflectionKind.null:
            return undefined; // JSON null maps directly, no transformation needed
        case ReflectionKind.number:
            return undefined; // JSON numbers map directly, no transformation needed
        case ReflectionKind.object:
            return undefined; // Generic objects map directly, no transformation needed
        case ReflectionKind.regexp:
            return `${comp.vλl} = new RegExp(${comp.vλl});`;
        case ReflectionKind.string:
            return undefined; // JSON strings map directly, no transformation needed
        case ReflectionKind.symbol:
            return `${comp.vλl} = Symbol(${comp.vλl}.replace('Symbol:', ''));`;
        case ReflectionKind.templateLiteral:
            throw new Error('Template Literals are not supported.');
        case ReflectionKind.undefined:
            return `${comp.vλl} = undefined;`;
        case ReflectionKind.void:
            return `${comp.vλl} = undefined;`;

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            const child = rt.getJitChild(comp);
            const childCode = child?.compile(comp, fnID);
            if (!childCode || !child) return undefined;
            const index = rt.getChildVarName(comp);
            const isExpression = childIsExpression(JitFunctions.jsonParse.id, child);
            const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
            return `for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`;
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const child = rt.getJitChild(comp);
            const childCode = child?.compile(comp, fnID);
            if (!child || !childCode) return undefined;
            const varName = comp.vλl;
            const prop = rt.getChildVarName(comp);
            const skipCode = rt.getSkipCode(comp, prop);
            const isExpression = childIsExpression(JitFunctions.jsonParse.id, child);
            const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
            return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                const rt = runType as FunctionParamsRunType;
                const skip = rt.skipJit(comp);
                if (skip) return undefined;
                const params = rt.getParamRunTypes(comp);
                if (params.length === 0) return undefined;
                const paramsCode = params
                    .map((p) => p.compile(comp, fnID))
                    .filter(Boolean)
                    .join(';');
                return paramsCode;
            } else {
                throw new Error(
                    `Compile function ${getOperationName(fnID)} not supported, call compileParams or compileReturn instead.`
                );
            }
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            switch (src.subKind) {
                case ReflectionSubKind.mapKey:
                case ReflectionSubKind.mapValue:
                case ReflectionSubKind.setItem:
                    return _compileJsonParseGenericMember(rt, comp, fnID);
                default:
                    return _compileJsonParseParameter(rt, comp, fnID);
            }
        }
        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const child = rt.getJitChild(comp);
            const childCode = child?.compile(comp, fnID);
            if (!child || !childCode) return undefined;
            const isExpression = childIsExpression(JitFunctions.jsonParse.id, child);
            const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
            if (rt.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
            return code;
        }
        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            let itemCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!itemCode) itemCode = comp.getChildVλl();
            const resultArr = `res${comp.getNestLevel(rt)}`;
            const index = rt.getChildVarName(comp);
            return `
                const ${resultArr} = [];
                for (let ${index} = ${rt.getChildIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const parsedItem = ${itemCode};
                    ${resultArr}.push(parsedItem);
                }
                return ${resultArr};
            `;
        }
        case ReflectionKind.tupleMember: {
            const rt = runType as ParameterRunType;
            let childCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!childCode) childCode = comp.getChildVλl();
            if (rt.isRest()) return childCode;
            const index = rt.getChildIndex(comp);
            if (rt.isOptional()) return `${comp.vλl}[${index}] !== undefined ? ${childCode} : undefined`;
            return childCode;
        }
        case ReflectionKind.promise: {
            throw new Error(`Jit compilation disabled for Non Serializable types.`);
        }

        // ###################### COLLECTION RUNTYPES ######################
        // Types that contain other types as members
        case ReflectionKind.objectLiteral:
        case ReflectionKind.intersection: {
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error(`${getOperationName(fnID)} is disabled for Non Serializable types.`);
            } else {
                const rt = runType as InterfaceRunType;
                return _compileJsonParseInterface(rt, comp, fnID);
            }
        }
        case ReflectionKind.class:
            return _compileJsonParseClass(runType, comp, fnID);
        case ReflectionKind.infer:
            throw new Error('Infer is not supported.');
        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const skip = rt.skipJit(comp);
            if (skip) return undefined;
            if (rt.getChildRunTypes().length === 0) return undefined;
            const paramsCode = rt
                .getChildRunTypes()
                .map((p) => p.compile(comp, fnID))
                .filter(Boolean)
                .join(';');
            return paramsCode;
        }
        case ReflectionKind.typeParameter:
            // Type parameter has been replaced by tuple member internally so this should never be called
            throw new Error('Type parameter not implemented.');
        case ReflectionKind.union: {
            const urt = runType as UnionRunType;
            const {simpleItems, objectTypes} = urt.getUnionChildren(comp);
            const errName = `uErr${comp.getNestLevel(urt)}`;
            const fail = `throw new Error(${errName});`;
            comp.setContextItem(
                errName,
                `const ${errName} = "Can not ${getOperationName(fnID)} union: item does not belong to the union"`
            );

            const isType = (unionItem) => urt.getChildStrictIsType(unionItem, comp);
            const ifElse = createIfElseFn();
            const onUnionTypes = (items: BaseRunType[]) => {
                const result = items.map((unionItem) => {
                    const childCode = unionItem.compile(comp, fnID);
                    // Check if this union item needs tuple encoding/decoding
                    const encCode = unionItem.compileToJsonVal(comp);
                    const decCode = unionItem.compileFromJsonVal(comp);
                    const needsTupleEncoding = !!encCode || !!decCode;
                    const index = urt.getUnionItemIndex(comp, unionItem);

                    if (needsTupleEncoding) {
                        // For tuple-encoded unions, parse the array and extract the value
                        const parseCode = childCode || comp.vλl;
                        return `${ifElse()} (Array.isArray(${comp.vλl}) && ${comp.vλl}[0] === ${index}) {return ${parseCode}}`;
                    } else {
                        // For direct unions, check type and parse
                        const parseCode = childCode || comp.vλl;
                        return `${ifElse()} (${isType(unionItem)}) {return ${parseCode}}`;
                    }
                });
                return result.filter(Boolean);
            };

            const itemsCode = onUnionTypes(simpleItems);
            if (!objectTypes.length) return `${itemsCode.join('')} else {${fail}}`;
            // these need to be in correct order for else if to work properly
            const nonObjectFail = `${ifElse()} (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) {${fail}}`;
            const objItemsCode = onUnionTypes(objectTypes);
            const allFail = `${ifElse(true)} {${fail}}`;
            const childrenCode = [...itemsCode, nonObjectFail, ...objItemsCode, allFail].join('');
            return childrenCode;
        }
        default:
            throw new Error(`Cant ${getOperationName(fnID)} for unsupported RunType: ${runType.getTypeName()}`);
    }
}

function getOperationName(fnID: Operation) {
    switch (fnID) {
        case JitFunctions.jsonParse.id:
            return 'JsonParse';
        default:
            throw new Error(`Unknown operation: ${fnID}`);
    }
}

function _compileJsonParseParameter(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const child = rt.getJitChild(comp);
    const childCode = child?.compile(comp, fnID);
    if (!childCode || !child) return undefined;
    if (rt.isRest()) return childCode;
    const isExpression = childIsExpression(JitFunctions.jsonParse.id, child);
    const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
    if (rt.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
    return code;
}

function _compileJsonParseGenericMember(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const child = rt.getJitChild(comp);
    const childCode = child?.compile(comp, fnID);
    if (!childCode || !child) return undefined;
    const isExpression = childIsExpression(JitFunctions.jsonParse.id, child);
    const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
    if (rt.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
    return code;
}

function _compileJsonParseInterface(rt: InterfaceRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    if (rt.isCallable()) return rt.getCallSignature()!.compile(comp, fnID);
    const children = rt.getJsonStringifySortedChildren(comp);
    if (children.length === 0) return undefined;

    const childrenCode = children
        .map((prop) => prop.compile(comp, fnID))
        .filter(Boolean)
        .join(';');

    return childrenCode;
}

function _compileJsonParseClass(runType: BaseRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return `${comp.vλl} = new Date(${comp.vλl});`;
        case ReflectionSubKind.map: {
            const rt = runType as MapRunType;
            return _compileJsonParseIterable(rt, comp, fnID);
        }
        case ReflectionSubKind.set: {
            const rt = runType as SetRunType;
            return _compileJsonParseIterable(rt, comp, fnID);
        }
        case ReflectionSubKind.nonSerializable:
            throw new Error(`Jit compilation disabled for Non Serializable types.`);
        default: {
            const rt = runType as ClassRunType;
            if (rt.isCallable()) {
                const callSignature = rt.getCallSignature();
                if (callSignature) return callSignature.compile(comp, fnID);
            }
            // For regular classes, parse as interface
            const children = rt.getJsonStringifySortedChildren(comp);
            if (children.length === 0) return undefined;

            const childrenCode = children
                .map((prop) => prop.compile(comp, fnID))
                .filter(Boolean)
                .join(';');

            return childrenCode;
        }
    }
}

export function _compileJsonParseIterable(rt: IterableRunType, comp: JitCompiler, fnID: JitFnID): string {
    const entry = rt.getCustomVλl(comp)?.vλl || comp.vλl;
    const jitChildren = rt.getJitChildren(comp);
    const childrenCode = jitChildren.map((c) => c.compile(comp, fnID)).join(';');
    if (!childrenCode) return '';

    // For Map and Set, we need to reconstruct them from the parsed array
    const isMap = rt.src.subKind === ReflectionSubKind.map;
    const isSet = rt.src.subKind === ReflectionSubKind.set;

    if (isMap) {
        return `${comp.vλl} = new Map(${comp.vλl});`;
    } else if (isSet) {
        return `${comp.vλl} = new Set(${comp.vλl});`;
    }

    // For other iterables, process each entry
    return `for (const ${entry} of ${comp.vλl}) {${childrenCode}}`;
}
