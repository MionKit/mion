/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind';
import {JitFunctions} from '../../constants.functions';
import {JitCompiler} from '../../lib/jitCompiler';
import {createIfElseFn, isSafePropName, parentIs} from '../../lib/utils';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import type {jitCode, JitFnID} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {ClassRunType} from '../../runType/collection/class';
import type {PropertyRunType} from '../../runType/member/property';
import type {MapRunType} from '../../runType/native/map';
import type {SetRunType} from '../../runType/native/set';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {TupleRunType} from '../../runType/collection/tuple';
import type {FunctionParamsRunType} from '../../runType/collection/functionParams';
import type {UnionRunType} from '../../runType/collection/union';
import type {ParameterRunType} from '../../runType/member/param';
import type {RestParamsRunType} from '../../runType/member/restParams';
import type {ArrayRunType} from '../../runType/member/array';
import type {MemberRunType} from '../../lib/baseRunTypes';
import type {LiteralRunType} from '../../runType/atomic/literal';
import type {IterableRunType} from '../../runType/native/Iterable';

type Operation = typeof JitFunctions.jsonStringify.id | typeof JitFunctions.toJavascript.id;

/** Centralized compile jit function with a switch statement that handles all node types. */
export function _compileJsonStringify(
    runType: BaseRunType,
    comp: JitCompiler,
    fnID: Operation = JitFunctions.jsonStringify.id
): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC RUNTYPES ######################
        // Primitive types and other atomic types that don't contain other types
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            return {code: `JSON.stringify(${comp.vλl})`, type: 'E'};
        case ReflectionKind.bigint:
            return {code: `'"'+${comp.vλl}.toString()+'"'`, type: 'E'};
        case ReflectionKind.boolean:
            return {code: `(${comp.vλl} ? 'true' : 'false')`, type: 'E'};
        case ReflectionKind.enum:
            if (src.indexType.kind === ReflectionKind.number) return {code: comp.vλl, type: 'E'};
            return {code: `JSON.stringify(${comp.vλl})`, type: 'E'};
        case ReflectionKind.enumMember:
            throw new Error('JsonStringify enum member is not supported.');
        case ReflectionKind.literal: {
            const rt = runType as LiteralRunType;
            if (src.literal instanceof RegExp) return _compileJsonStringify({src: {kind: ReflectionKind.regexp}} as any, comp);
            const literalRt = runType;
            const originalKind = src.kind;
            let result: jitCode;
            switch (typeof rt.src.literal) {
                case 'number':
                    literalRt.src.kind = ReflectionKind.number;
                    result = _compileJsonStringify(literalRt, comp);
                    break;
                case 'string':
                    literalRt.src.kind = ReflectionKind.string;
                    result = _compileJsonStringify(literalRt, comp);
                    break;
                case 'boolean':
                    literalRt.src.kind = ReflectionKind.boolean;
                    result = _compileJsonStringify(literalRt, comp);
                    break;
                case 'bigint':
                    literalRt.src.kind = ReflectionKind.bigint;
                    result = _compileJsonStringify(literalRt, comp);
                    break;
                case 'symbol':
                    literalRt.src.kind = ReflectionKind.symbol;
                    result = _compileJsonStringify(literalRt, comp);
                    break;
                default:
                    result = {code: `JSON.stringify(${comp.vλl})`, type: 'E'};
                    break;
            }
            literalRt.src.kind = originalKind;
            return result;
        }
        case ReflectionKind.never:
            throw new Error('Never type cannot be stringified.');
        case ReflectionKind.null: {
            const isRoot = comp.getNestLevel(runType) === 0;
            return {code: isRoot ? `String(${comp.vλl})` : comp.vλl, type: 'E'};
        }
        case ReflectionKind.number: {
            const isRoot = comp.getNestLevel(runType) === 0;
            return {code: isRoot ? `String(${comp.vλl})` : comp.vλl, type: 'E'};
        }
        case ReflectionKind.object:
            return {code: `JSON.stringify(${comp.vλl})`, type: 'E'};
        case ReflectionKind.regexp:
            return {code: `utl.asJSONString(${comp.vλl}.toString())`, type: 'E'};
        case ReflectionKind.string:
            return {code: `utl.asJSONString(${comp.vλl})`, type: 'E'};
        case ReflectionKind.symbol:
            return {code: `JSON.stringify('Symbol:' + (${comp.vλl}.description || ''))`, type: 'E'};
        case ReflectionKind.templateLiteral:
            throw new Error('Template Literals are not supported.');
        case ReflectionKind.undefined: {
            const isRoot = comp.getNestLevel(runType) === 0;
            if (isRoot) return {code: `undefined`, type: 'E'};
            const parentIsArray = parentIs(runType, ReflectionKind.array);
            if (parentIsArray) return {code: `'null'`, type: 'E'}; // we use array.join(',') to serialize arrays, so we need to return null literal (string)
            return {code: `null`, type: 'E'};
        }
        case ReflectionKind.void:
            return {code: 'undefined', type: 'E'};

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            rt.checkNonSkipTypes(comp);
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode?.code) return {code: `JSON.stringify(${comp.vλl})`, type: 'RB'};
            const jsonItems = `ls${comp.getNestLevel(rt)}`;
            const resultVal = `res${comp.getNestLevel(rt)}`;
            const index = rt.getChildVarName(comp);
            return {
                code: `
                const ${jsonItems} = [];
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${resultVal} = ${memberCode.code};
                    ${jsonItems}.push(${resultVal});
                }
                return '[' + ${jsonItems}.join(',') + ']';
            `,
                type: 'RB',
            };
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const child = rt.getJitChild(comp);
            const jsonVal = child?.compile(comp, fnID);
            if (!child || !jsonVal?.code) return {code: undefined, type: 'RB'};
            const varName = comp.vλl;
            const prop = rt.getChildVarName(comp);
            const arrName = `ls${comp.getNestLevel(rt)}`;
            const sep = rt.skipCommas ? '' : '+","';
            const skipCode = rt.getSkipCode(comp, prop);
            return {
                code: `
                const ${arrName} = [];
                for (const ${prop} in ${varName}) {
                    ${skipCode}
                    if (${prop} !== undefined) ${arrName}.push(utl.asJSONString(${prop}) + ':' + ${jsonVal.code});
                }
                if (!${arrName}.length) return '';
                return ${arrName}.join(',')${sep};
            `,
                type: 'RB',
            };
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                const rt = runType as FunctionParamsRunType;
                const skip = rt.skipJit(comp);
                if (skip) return {code: '', type: 'E'};
                const params = rt.getParamRunTypes(comp);
                if (params.length === 0) return {code: `'[]'`, type: 'E'};
                const paramsCode = params.map((p) => p.compile(comp, fnID)?.code).join('+');
                return {code: `'['+${paramsCode}+']'`, type: 'E'};
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
                    return _compileJsonStringifyGenericMember(rt, comp, fnID);
                default:
                    return _compileJsonStringifyParameter(rt, comp, fnID);
            }
        }
        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const child = rt.getJitChild(comp);
            const propCode = child?.compile(comp, fnID);
            if (!child || !propCode?.code) return {code: undefined, type: 'E'};
            // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
            const sep = rt.skipCommas ? '' : '+","';
            // encoding safe property with ':' inside the string saves a little processing
            // when prop is not safe we need to double encode double quotes and escape characters
            const propDef = getPropName(rt, comp, fnID);
            if (rt.src.optional) {
                rt.tempChildVλl = comp.getChildVλl();
                // TODO: check if json for an object with first property undefined is valid (maybe the comma must be dynamic too)
                return {code: `(${rt.tempChildVλl} === undefined ? '' : ${propDef}+${propCode.code}${sep})`, type: 'E'};
            }
            return {code: `${propDef}+${propCode.code}${sep}`, type: 'E'};
        }
        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            const itemCode = rt.getJitChild(comp)?.compile(comp, fnID);
            const itemCodeStr = itemCode?.code || 'JSON.stringify(' + comp.getChildVλl() + ')';
            const arrName = `res${comp.getNestLevel(rt)}`;
            const itemName = `its${comp.getNestLevel(rt)}`;
            const index = rt.getChildVarName(comp);
            const isFist = rt.getChildIndex(comp) === 0;
            const sep = isFist ? '' : `','+`;
            return {
                code: `
                const ${arrName} = [];
                for (let ${index} = ${rt.getChildIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${itemName} = ${itemCodeStr};
                    if(${itemName}) ${arrName}.push(${itemName});
                }
                if (!${arrName}.length) {return '';}
                else {return ${sep}${arrName}.join(',')}
            `,
                type: 'RB',
            };
        }
        case ReflectionKind.tupleMember: {
            const rt = runType as ParameterRunType;
            const childCode = rt.getJitChild(comp)?.compile(comp, fnID);
            const childCodeStr = childCode?.code || `null`; // non serializable types are set to null
            if (rt.isRest()) return childCode || {code: `null`, type: 'E'};
            const isFirst = rt.getChildIndex(comp) === 0;
            const sep = isFirst ? '' : `','+`;
            if (rt.isOptional())
                return {code: `(${comp.getChildVλl()} === undefined ? ${sep}'null' : ${sep}${childCodeStr})`, type: 'E'};
            return {code: `${sep}${childCodeStr}`, type: 'E'};
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
                return _compileJsonStringifyInterface(rt, comp, fnID);
            }
        }
        case ReflectionKind.class:
            return _compileJsonStringifyClass(runType, comp, fnID);
        case ReflectionKind.infer:
            throw new Error('Infer is not supported.');
        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const skip = rt.skipJit(comp);
            if (skip) return {code: '', type: 'E'};
            if (rt.getChildRunTypes().length === 0) return {code: `'[]'`, type: 'E'};
            const paramsCode = rt
                .getChildRunTypes()
                .map((p) => p.compile(comp, fnID)?.code)
                .join('+');
            return {code: `'['+${paramsCode}+']'`, type: 'E'};
        }
        case ReflectionKind.typeParameter:
            // Type parameter has been replaced by tuple member internally so this should never be called
            throw new Error('Type parameter not implemented.');
        case ReflectionKind.union: {
            const urt = runType as UnionRunType;
            urt.checkNonSkipTypes(comp);
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
                    // TODO: calling full encode/decode could be expensive and we calling it only to know if it needs encoding.
                    // we might want to optimize this
                    const encCode = unionItem.compileToJsonVal(comp);
                    const decCode = unionItem.compileFromJsonVal(comp);
                    const needsTupleEncoding = !!encCode?.code || !!decCode?.code;
                    const skiEncode = !childCode?.code || childCode.code === comp.vλl;
                    const stringifyCode = skiEncode ? comp.vλl : childCode.code;
                    const index = urt.getUnionItemIndex(comp, unionItem);
                    const toTuple = `'[${index},' + ${stringifyCode} + ']'`;
                    const tupleCode = unionItem.getFamily() === 'A' ? `(${toTuple})` : toTuple;
                    if (needsTupleEncoding) return `${ifElse()} (${isType(unionItem)}) {return ${tupleCode}}`;
                    return `${ifElse()} (${isType(unionItem)}) {return ${stringifyCode}}`;
                });
                return result.filter(Boolean);
            };

            const itemsCode = onUnionTypes(simpleItems);
            if (!objectTypes.length) return {code: `${itemsCode.join('')} else {${fail}}`, type: 'RB'};
            // these need to be in correct order for else if to work properly
            const nonObjectFail = `${ifElse()} (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) {${fail}}`;
            const objItemsCode = onUnionTypes(objectTypes);
            const allFail = `${ifElse(true)} {${fail}}`;
            const childrenCode = [...itemsCode, nonObjectFail, ...objItemsCode, allFail].join('');
            return {code: childrenCode, type: 'RB'};
        }
        default:
            throw new Error(`Cant ${getOperationName(fnID)} for unsupported RunType: ${runType.getTypeName()}`);
    }
}

function getOperationName(fnID: Operation) {
    switch (fnID) {
        case JitFunctions.jsonStringify.id:
            return 'JsonStringify';
        case JitFunctions.toJavascript.id:
            return 'ToCode';
        default:
            throw new Error(`Unknown operation: ${fnID}`);
    }
}

function getPropName(rt: PropertyRunType, comp: JitCompiler, fnID: JitFnID): string {
    if (!isSafePropName(rt.src.name)) return `${JSON.stringify(rt.getChildLiteral(comp) as string)}+':'`;
    if (fnID === JitFunctions.toJavascript.id) return `'${rt.getChildVarName(comp)}:'`;
    return `'"${rt.getChildVarName(comp)}":'`;
}

function _compileJsonStringifyParameter(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const childCode = rt.getJitChild(comp)?.compile(comp, fnID);
    const childCodeStr = childCode?.code || `null`; // non serializable types are set to null
    if (rt.isRest()) return childCode || {code: `null`, type: 'E'};
    const isFirst = rt.getChildIndex(comp) === 0;
    const sep = isFirst ? '' : `','+`;
    if (rt.isOptional()) return {code: `(${comp.getChildVλl()} === undefined ? ${sep}'null' : ${sep}${childCodeStr})`, type: 'E'};
    return {code: `${sep}${childCodeStr}`, type: 'E'};
}

function _compileJsonStringifyGenericMember(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const child = rt.getJitChild(comp);
    const argCode = child?.compile(comp, fnID);
    if (!argCode?.code) return {code: undefined, type: 'E'};
    const isFirst = rt.getChildIndex(comp) === 0;
    const sep = isFirst ? '' : `','+`;
    if (rt.isOptional()) return {code: `(${comp.getChildVλl()} === undefined ? '': ${sep}${argCode.code})`, type: 'E'};
    return {code: `${sep}${argCode.code}`, type: 'E'};
}

function _compileJsonStringifyInterface(rt: InterfaceRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    if (rt.isCallable()) return rt.getCallSignature()!.compile(comp, fnID);
    const children = rt.getJsonStringifySortedChildren(comp);
    if (children.length === 0) return {code: `''`, type: 'E'};
    const allOptional = children.every((prop) => (prop as MemberRunType<any>).isOptional());
    // if all properties are optional,  we can not optimize and use JSON.stringify
    if (allOptional) return _compileInterfaceIntoArray(rt, comp, children, fnID);
    const childrenCode = children
        .map((prop, i) => {
            const nexChild = children[i + 1];
            const isLast = !nexChild;
            prop.skipCommas = isLast;
            return prop.compile(comp, fnID)?.code;
        })
        .filter(Boolean)
        .join('+');
    return {code: `'{'+${childrenCode}+'}'`, type: 'E'};
}

function _compileInterfaceIntoArray(
    rt: InterfaceRunType,
    comp: JitCompiler,
    children: MemberRunType<any>[],
    fnID: JitFnID
): jitCode {
    const arrName = `ns${comp.getNestLevel(rt)}`;
    const childrenCode = children
        .map((prop) => {
            prop.skipCommas = true;
            const childCode = prop.compile(comp, fnID);
            if (!childCode?.code) return '';
            const code = `${arrName}.push(${childCode.code})`;
            // makes an extra check to avoid pushing empty strings to the array (childCode also makes the same check but is better than having to filter the array after)
            return prop.isOptional() && prop.tempChildVλl ? `if (${prop.tempChildVλl} !== undefined){${code}}` : `${code};`;
        })
        .filter(Boolean)
        .join('');

    return {code: `(function(){const ${arrName} = [];${childrenCode};return '{'+${arrName}.join(',')+'}'})()`, type: 'E'};
}

function _compileJsonStringifyClass(runType: BaseRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return {code: `'"'+${comp.vλl}.toJSON()+'"'`, type: 'E'};
        case ReflectionSubKind.map: {
            const rt = runType as unknown as MapRunType;
            return _compileJsonStringifyIterable(rt as unknown as IterableRunType, comp, fnID);
        }
        case ReflectionSubKind.set: {
            const rt = runType as unknown as SetRunType;
            return _compileJsonStringifyIterable(rt as unknown as IterableRunType, comp, fnID);
        }
        case ReflectionSubKind.nonSerializable:
            throw new Error(`Jit compilation disabled for Non Serializable types.`);
        default: {
            const rt = runType as unknown as ClassRunType;
            if (rt.isCallable()) {
                const callSignature = rt.getCallSignature();
                if (callSignature) return callSignature.compile(comp, fnID);
            }
            // optional and index properties must be compiled first to prevent trailing commas
            // this is because the last trailing comma is calculated statically
            // maybe we need to move that trailing comma compilation to be dynamic
            // but we would need to create a self invoking function for that
            const children = rt.getJsonStringifySortedChildren(comp);
            if (children.length === 0) return {code: `''`, type: 'E'};
            const childrenCode = children
                .map((prop, i) => {
                    const nexChild = children[i + 1];
                    const isLast = !nexChild;
                    prop.skipCommas = isLast;
                    return prop.compile(comp, fnID)?.code;
                })
                .filter(Boolean)
                .join('+');
            return {code: `'{'+${childrenCode}+'}'`, type: 'E'};
        }
    }
}

export function _compileJsonStringifyIterable(
    rt: IterableRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    /** prefix characters to add before the generated array, used when generating code instead json */
    codePrefix: string = '',
    /** suffix characters to add after the generated array, used when generating code instead json */
    codeSuffix: string = ''
): jitCode {
    const entry = rt.getCustomVλl(comp)?.vλl || comp.vλl;
    const jitChildren = rt.getJitChildren(comp);
    const childrenCode = jitChildren.map((c) => c.compile(comp, fnID)?.code).join('+');
    const jsonItems = `ls${comp.getNestLevel(rt as unknown as BaseRunType)}`;
    const resultVal = `res${comp.getNestLevel(rt as unknown as BaseRunType)}`;
    const childrenResult = jitChildren.length > 1 ? `'['+${childrenCode}+']'` : childrenCode;
    const earlyReturn = codePrefix && codeSuffix ? `if (!${jsonItems}.length) return '${codePrefix}${codeSuffix}';` : '';
    return {
        code: `
        const ${jsonItems} = [];
        for (const ${entry} of ${comp.vλl}) {
            const ${resultVal} = ${childrenResult};
            ${jsonItems}.push(${resultVal});
        }
        ${earlyReturn}return '${codePrefix}[' + ${jsonItems}.join(',') + ']${codeSuffix}'
    `,
        type: 'RB',
    };
}
