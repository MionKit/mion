/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {isSafePropName} from '@mionkit/run-types/src/lib/utils';
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
import type {MemberRunType} from '../lib/baseRunTypes';
import type {LiteralRunType} from '@mionkit/run-types/src/runType/atomic/literal';
import type {IterableRunType} from '@mionkit/run-types/src/runType/native/Iterable';

type Operation = typeof JitFunctions.jsonStringify.id | typeof JitFunctions.toCode.id;

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
            throw new Error(`Cannot compile ${getOperationName(fnID)} for unknown type.`);
        case ReflectionKind.any:
            throw new Error(`Cannot compile ${getOperationName(fnID)} for any type.`);
        case ReflectionKind.bigint:
            return `'"'+${comp.vλl}.toString()+'"'`;
        case ReflectionKind.boolean:
            return `(${comp.vλl} ? 'true' : 'false')`;
        case ReflectionKind.enum:
            if (src.indexType.kind === ReflectionKind.number) return comp.vλl;
            return `JSON.stringify(${comp.vλl})`;
        case ReflectionKind.enumMember:
            throw new Error('JsonStringify enum member is not supported.');
        case ReflectionKind.literal: {
            const rt = runType as LiteralRunType;
            if (src.literal instanceof RegExp) return _compileJsonStringify({src: {kind: ReflectionKind.regexp}} as any, comp);
            switch (typeof rt.src.literal) {
                case 'number':
                    return _compileJsonStringify({src: {kind: ReflectionKind.number}} as any, comp);
                case 'string':
                    return _compileJsonStringify({src: {kind: ReflectionKind.string}} as any, comp);
                case 'boolean':
                    return _compileJsonStringify({src: {kind: ReflectionKind.boolean}} as any, comp);
                case 'bigint':
                    return _compileJsonStringify({src: {kind: ReflectionKind.bigint}} as any, comp);
                case 'symbol':
                    return _compileJsonStringify({src: {kind: ReflectionKind.symbol}} as any, comp);
                default:
                    return `JSON.stringify(${comp.vλl})`;
            }
        }
        case ReflectionKind.never:
            throw new Error('Never type cannot be stringified.');
        case ReflectionKind.null:
            return comp.vλl;
        case ReflectionKind.number:
            return comp.vλl;
        case ReflectionKind.object:
            return `JSON.stringify(${comp.vλl})`;
        case ReflectionKind.regexp:
            return `utl.asJSONString(${comp.vλl}.toString())`;
        case ReflectionKind.string:
            return `utl.asJSONString(${comp.vλl})`;
        case ReflectionKind.symbol:
            return `JSON.stringify('Symbol:' + (${comp.vλl}.description || ''))`;
        case ReflectionKind.templateLiteral:
            throw new Error('Template Literals are not supported.');
        case ReflectionKind.undefined:
            return `null`;
        case ReflectionKind.void:
            return 'undefined';

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return `JSON.stringify(${comp.vλl})`;
            const jsonItems = `ls${rt.getNestLevel()}`;
            const resultVal = `res${rt.getNestLevel()}`;
            const index = rt.getChildVarName();
            return `
                const ${jsonItems} = [];
                for (let ${index} = ${rt.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${resultVal} = ${memberCode};
                    ${jsonItems}.push(${resultVal});
                }
                return '[' + ${jsonItems}.join(',') + ']';
            `;
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const child = rt.getJitChild(comp);
            const jsonVal = child?.compile(comp, fnID);
            if (!child || !jsonVal) return undefined;
            const varName = comp.vλl;
            const prop = rt.getChildVarName();
            const arrName = `ls${rt.getNestLevel()}`;
            const sep = rt.skipCommas ? '' : '+","';
            const skipCode = rt.getSkipCode(comp, prop);
            return `
                const ${arrName} = [];
                for (const ${prop} in ${varName}) {
                    ${skipCode}
                    if (${prop} !== undefined) ${arrName}.push(utl.asJSONString(${prop}) + ':' + ${jsonVal});
                }
                return ${arrName}.join(',')${sep};
            `;
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                const rt = runType as FunctionParamsRunType;
                const skip = rt.skipJit(comp);
                if (skip) return '';
                const params = rt.getParamRunTypes(comp);
                if (params.length === 0) return `'[]'`;
                const paramsCode = params.map((p) => p.compile(comp, fnID)).join('+');
                return `'['+${paramsCode}+']'`;
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
            if (!child || !propCode) return undefined;
            // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
            const sep = rt.skipCommas ? '' : '+","';
            // encoding safe property with ':' inside the string saves a little processing
            // when prop is not safe we need to double encode double quotes and escape characters
            const propDef = getPropName(rt, fnID);
            if (rt.src.optional) {
                rt.tempChildVλl = comp.getChildVλl();
                // TODO: check if json for an object with first property undefined is valid (maybe the comma must be dynamic too)
                return `(${rt.tempChildVλl} === undefined ? '' : ${propDef}+${propCode}${sep})`;
            }
            return `${propDef}+${propCode}${sep}`;
        }
        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            let itemCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!itemCode) itemCode = 'JSON.stringify(' + comp.getChildVλl() + ')';
            const arrName = `res${rt.getNestLevel()}`;
            const itemName = `its${rt.getNestLevel()}`;
            const index = rt.getChildVarName();
            const isFist = rt.getChildIndex(comp) === 0;
            const sep = isFist ? '' : `','+`;
            return `
                const ${arrName} = [];
                for (let ${index} = ${rt.getChildIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${itemName} = ${itemCode};
                    if(${itemName}) ${arrName}.push(${itemName});
                }
                if (!${arrName}.length) {return '';}
                else {return ${sep}${arrName}.join(',')}
            `;
        }
        case ReflectionKind.tupleMember: {
            const rt = runType as ParameterRunType;
            let childCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!childCode) childCode = `null`; // non serializable types are set to null
            if (rt.isRest()) return childCode;
            const isFirst = rt.getChildIndex(comp) === 0;
            const sep = isFirst ? '' : `','+`;
            if (rt.isOptional()) return `(${comp.getChildVλl()} === undefined ? ${sep}'null' : ${sep}${childCode})`;
            return `${sep}${childCode}`;
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
            if (skip) return '';
            if (rt.getChildRunTypes().length === 0) return `'[]'`;
            const paramsCode = rt
                .getChildRunTypes()
                .map((p) => p.compile(comp, fnID))
                .join('+');
            return `'['+${paramsCode}+']'`;
        }
        case ReflectionKind.typeParameter:
            // Type parameter has been replaced by tuple member internally so this should never be called
            throw new Error('Type parameter not implemented.');
        case ReflectionKind.union: {
            const urt = runType as UnionRunType;
            // TODO: enforce strictTypes to ensure no extra properties of the union go unchecked
            const childrenCode = urt
                .getJitChildren(comp)
                .map((rt, i) => {
                    const itemIsType = urt.getChildStrictIsType(rt, comp);
                    const childCode = rt.compile(comp, fnID);
                    const skipDecode = !childCode || childCode === comp.vλl;
                    const stringifyCode = skipDecode ? comp.vλl : `${childCode}`;
                    const code = `'[${i},' + ${stringifyCode} + ']'`;
                    const itemCode = rt.getFamily() === 'A' ? `(${code})` : code;
                    return `if (${itemIsType}) {return ${itemCode}}`;
                })
                .filter(Boolean)
                .join('');
            const code = `${childrenCode} else { throw new Error('Can not ${getOperationName(fnID)} union: expected one of <${urt.getUnionTypeNames()}> but got ' + ${comp.vλl}?.constructor?.name || typeof ${comp.vλl}) }`;
            return code;
        }
        default:
            throw new Error(`Cant ${getOperationName(fnID)} for unsupported RunType: ${runType.getTypeName()}`);
    }
}

function getOperationName(fnID: Operation) {
    switch (fnID) {
        case JitFunctions.jsonStringify.id:
            return 'JsonStringify';
        case JitFunctions.toCode.id:
            return 'ToCode';
        default:
            throw new Error(`Unknown operation: ${fnID}`);
    }
}

function getPropName(rt: PropertyRunType, fnID: JitFnID): string {
    if (!isSafePropName(rt.src.name)) return `${JSON.stringify(rt.getChildLiteral() as string)}+':'`;
    if (fnID === JitFunctions.toCode.id) return `'${rt.getChildVarName()}:'`;
    return `'"${rt.getChildVarName()}":'`;
}

function _compileJsonStringifyParameter(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    let childCode = rt.getJitChild(comp)?.compile(comp, fnID);
    if (!childCode) childCode = `null`; // non serializable types are set to null
    if (rt.isRest()) return childCode;
    const isFirst = rt.getChildIndex(comp) === 0;
    const sep = isFirst ? '' : `','+`;
    if (rt.isOptional()) return `(${comp.getChildVλl()} === undefined ? ${sep}'null' : ${sep}${childCode})`;
    return `${sep}${childCode}`;
}

function _compileJsonStringifyGenericMember(rt: ParameterRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const child = rt.getJitChild(comp);
    const argCode = child?.compile(comp, fnID);
    if (!argCode) return undefined;
    const isFirst = rt.getChildIndex(comp) === 0;
    const sep = isFirst ? '' : `','+`;
    if (rt.isOptional()) return `(${comp.getChildVλl()} === undefined ? '': ${sep}${argCode})`;
    return `${sep}${argCode}`;
}

function _compileJsonStringifyInterface(rt: InterfaceRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    if (rt.isCallable()) return rt.getCallSignature()!.compile(comp, fnID);
    const children = rt.getJsonStringifyChildren(comp);
    if (children.length === 0) return `''`;
    const allOptional = children.every((prop) => (prop as MemberRunType<any>).isOptional());
    // if all properties are optional,  we can not optimize and use JSON.stringify
    if (allOptional) return _compileInterfaceIntoArray(rt, comp, children, fnID);
    const childrenCode = children
        .map((prop, i) => {
            const nexChild = children[i + 1];
            const isLast = !nexChild;
            prop.skipCommas = isLast;
            return prop.compile(comp, fnID);
        })
        .filter(Boolean)
        .join('+');
    return `'{'+${childrenCode}+'}'`;
}

function _compileInterfaceIntoArray(
    rt: InterfaceRunType,
    comp: JitCompiler,
    children: MemberRunType<any>[],
    fnID: JitFnID
): jitCode {
    const arrName = `ns${rt.getNestLevel()}`;
    const childrenCode = children
        .map((prop) => {
            prop.skipCommas = true;
            const childCode = prop.compile(comp, fnID);
            if (!childCode) return '';
            const code = `${arrName}.push(${childCode})`;
            // makes an extra check to avoid pushing empty strings to the array (childCode also makes the same check but is better than having to filter the array after)
            return prop.isOptional() ? `if (${prop.tempChildVλl} !== undefined){${code}}` : `${code};`;
        })
        .filter(Boolean)
        .join('');

    return `(function(){const ${arrName} = [];${childrenCode};return '{'+${arrName}.join(',')+'}'})()`;
}

function _compileJsonStringifyClass(runType: BaseRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return `'"'+${comp.vλl}.toJSON()+'"'`;
        case ReflectionSubKind.map: {
            const rt = runType as MapRunType;
            return _compileJsonStringifyIterable(rt, comp, fnID);
        }
        case ReflectionSubKind.set: {
            const rt = runType as SetRunType;
            return _compileJsonStringifyIterable(rt, comp, fnID);
        }
        case ReflectionSubKind.nonSerializable:
            throw new Error(`Jit compilation disabled for Non Serializable types.`);
        default: {
            const rt = runType as ClassRunType;
            if (rt.isCallable()) {
                const callSignature = rt.getCallSignature();
                if (callSignature) return callSignature.compile(comp, fnID);
            }
            const children = rt.getJsonStringifyChildren(comp);
            if (children.length === 0) return `''`;
            const childrenCode = children
                .map((prop, i) => {
                    const nexChild = children[i + 1];
                    const isLast = !nexChild;
                    prop.skipCommas = isLast;
                    return prop.compile(comp, fnID);
                })
                .filter(Boolean)
                .join('+');
            return `'{'+${childrenCode}+'}'`;
        }
    }
}

export function _compileJsonStringifyIterable(
    rt: IterableRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    prefix?: string,
    suffix?: string
): string {
    const entry = rt.getCustomVλl(comp)?.vλl || comp.vλl;
    const jitChildren = rt.getJitChildren(comp);
    const childrenCode = jitChildren.map((c) => c.compile(comp, fnID)).join('+');
    const jsonItems = `ls${rt.getNestLevel()}`;
    const resultVal = `res${rt.getNestLevel()}`;
    const childrenResult = jitChildren.length > 1 ? `'['+${childrenCode}+']'` : childrenCode;
    return `
        const ${jsonItems} = [];
        for (const ${entry} of ${comp.vλl}) {
            const ${resultVal} = ${childrenResult};
            ${jsonItems}.push(${resultVal});
        }
        return '${prefix || ''}[' + ${jsonItems}.join(',') + ']${suffix || ''}';
    `;
}
