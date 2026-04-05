/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCode} from '../../types.ts';
import type {BaseRunType} from '../../lib/baseRunTypes.ts';
import type {ClassRunType} from '../../nodes/collection/class.ts';
import type {MethodSignatureRunType} from '../../nodes/member/methodSignature.ts';
import type {IterableRunType} from '../../nodes/native/Iterable.ts';
import {ReflectionKind, type TypeMethodSignature, type TypeObjectLiteral, type TypePropertySignature} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind.ts';
import {JitFunctions} from '../../constants.functions.ts';
import {JitFnCompiler} from '../../lib/jitFnCompiler.ts';
import {isSafePropName} from '../../lib/utils.ts';
import {createStringifyCompiler, createStringifyIterable} from './stringifyJson.ts';
import {cpf_sanitizeCompiledFn} from '../../run-types-pure-fns.ts';

/** Gets sibling property/method names from a MethodSignature's parent ObjectLiteral */
function getParentSiblingNames(srcMS: TypeMethodSignature): Set<string | number | symbol> | undefined {
    let parent = srcMS.parent as any;
    // Handle deepkit bug where parent can be TypePropertySignature instead of TypeObjectLiteral
    if (parent?.kind === ReflectionKind.propertySignature) parent = parent.parent;
    if (parent?.kind !== ReflectionKind.objectLiteral) return undefined;
    const types = (parent as TypeObjectLiteral).types;
    if (!types) return undefined;
    return new Set(types.map((t: any) => t.name).filter((n: any) => n !== undefined));
}

export function createToCodeCompiler() {
    const fnID = JitFunctions.toJSCode.id;
    const visitJsonStringify = createStringifyCompiler(fnID);
    const visitJsonStringifyIterable = createStringifyIterable(fnID);

    /**
     * Compiles jit code to generate JavaScript code from data structures that match a Type.
     * Process is similar to transform JS to JSON, but with few differences.
     *
     * 1 - jitFunctions and pureFunctions are emitted as src code
     * 2 - Some native classes are supported and initialized using the new operator, ie: new Map(<data>), new Set(<data>), new Date(<data>), etc...
     *
     * THIS IS MOSTLY USED INTERNALLY FOR AOT CODE GENERATION AND A VERY BASIC IMPLEMENTATION.
     * !!! NOT INTENDED FOR PUBLIC USE !!!
     */
    function compileToCode(runType: BaseRunType, comp: JitFnCompiler): JitCode {
        const src = runType.src;
        const kind = src.kind;

        switch (kind) {
            // ###################### ATOMIC RUNTYPES ######################
            case ReflectionKind.undefined:
                return {code: `'undefined'`, type: 'E'};
            case ReflectionKind.symbol:
                return {code: `'Symbol('+'"'+${comp.vλl}.description+'"'+')'`, type: 'E'};
            // ###################### MEMBER RUNTYPES ######################
            case ReflectionKind.methodSignature: {
                const rt = runType as MethodSignatureRunType;
                const srcMS = src as TypeMethodSignature;
                const accessor = srcMS.name;
                const name = String(accessor);
                const isSafe = isSafePropName(accessor);
                const safeName = isSafe ? name : JSON.stringify(name);
                const sep = rt.skipCommas ? '' : '+","';
                if (isCompilingFnProp(rt, comp)) {
                    // special case for JitFunctions/PureFunctions that we know should return undefined for fn param
                    return {code: `'undefined'`, type: 'E'};
                } else if (isCompilingClosureFn(rt, comp)) {
                    // special case for JitFunctions/PureFunctions where we generate the fn from the data instead of fn.toString()
                    const isPureFn = rt.getChildVarName(comp) === 'createPureFn';
                    const fnName = isPureFn ? `${comp.vλl}.fnName` : `${comp.vλl}.jitFnHash`;
                    const fnCode = `${comp.vλl}.code`;
                    const paramList = isPureFn ? `${comp.vλl}.paramNames.join(',')` : `'utl'`;
                    const closureCode = `'function get_'+${fnName}+'('+${paramList}+'){'+${fnCode}+'}'`;
                    return {code: `'${safeName}:'+${closureCode}${sep}`, type: 'E'};
                } else if (rt.src.subKind === ReflectionSubKind.params) {
                    const paramsCode = visitJsonStringify(rt, comp);
                    if (rt.isOptional())
                        return {
                            code: `(${comp.getChildVλl()} === undefined ? "" : '${safeName}:'+${paramsCode?.code}${sep})`,
                            type: 'E',
                        };
                    return {code: `'${safeName}:'+${paramsCode?.code}${sep}`, type: 'E'};
                } else {
                    const fnName = comp.addPureFunction(cpf_sanitizeCompiledFn);
                    const parent = srcMS.parent as any as TypePropertySignature;

                    // in some scenarios the parent is a propertySignature instead the Expected TypeObjectLiteral so we have to handle that
                    // this seems to be a deepkit bug when using omit and then redefining the property @see SrcCodeJitCompiledFn type
                    const isDuplicatedChild = parent?.kind === ReflectionKind.propertySignature && parent?.name === srcMS.name;
                    if (isDuplicatedChild) return {code: `${fnName}(${comp.vλl}.toString())`, type: 'E'};
                    const accessorCode = isSafe ? `.${safeName}` : `[${safeName}]`;
                    const fnCode = `${fnName}(${comp.vλl}${accessorCode}.toString())`;
                    if (rt.isOptional())
                        return {code: `(${comp.getChildVλl()} === undefined ? "" : '${safeName}:'+${fnCode}${sep})`, type: 'E'};
                    return {code: `'${safeName}:'+${fnCode}${sep}`, type: 'E'};
                }
            }
            case ReflectionKind.function:
            case ReflectionKind.method:
            case ReflectionKind.callSignature:
                if (runType.src.subKind === ReflectionSubKind.params) {
                    return visitJsonStringify(runType, comp);
                } else {
                    // TODO: we are relying in fn.toString() to generate code, this might not work properly in all js engines
                    return {code: `${comp.vλl}.toString()`, type: 'E'};
                }
            // ###################### COLLECTION RUNTYPES ######################
            case ReflectionKind.class: {
                switch (runType.src.subKind) {
                    case ReflectionSubKind.date:
                        return {code: `'new Date('+${visitJsonStringify(runType, comp).code}+')'`, type: 'E'};
                    case ReflectionSubKind.map: {
                        return visitJsonStringifyIterable(runType as unknown as IterableRunType, comp, 'new Map(', ')');
                    }
                    case ReflectionSubKind.set: {
                        return visitJsonStringifyIterable(runType as unknown as IterableRunType, comp, 'new Set(', ')');
                    }
                    case ReflectionSubKind.nonSerializable:
                        throw new Error(`Can not generate code for Non Serializable types.`);
                    default: {
                        const rt = runType as unknown as ClassRunType;
                        throw new Error(`Can not generate code for classes. Class: ${rt.getClassName()}`);
                    }
                }
            }
            default:
                return visitJsonStringify(runType, comp);
        }
    }

    /** Detects if we're compiling a createJitFn or createPureFn closure by checking sibling properties */
    function isCompilingClosureFn(runType: MethodSignatureRunType, comp: JitFnCompiler): boolean {
        const childName = runType.getChildVarName(comp);
        if (childName !== 'createJitFn' && childName !== 'createPureFn') return false;
        const siblings = getParentSiblingNames(runType.src as TypeMethodSignature);
        if (!siblings) return false;
        if (childName === 'createJitFn') return siblings.has('jitFnHash');
        return siblings.has('bodyHash'); // createPureFn
    }

    /** Detects if we're compiling the fn property of a JitCompiledFn or CompiledPureFunction */
    function isCompilingFnProp(runType: MethodSignatureRunType, comp: JitFnCompiler): boolean {
        if (runType.getChildVarName(comp) !== 'fn') return false;
        const siblings = getParentSiblingNames(runType.src as TypeMethodSignature);
        if (!siblings) return false;
        return (
            (siblings.has('createJitFn') && siblings.has('jitFnHash')) ||
            (siblings.has('createPureFn') && siblings.has('bodyHash'))
        );
    }

    return compileToCode;
}

// lazy loading as this function wont be used often just for (AOT)
// TODO move to async code loading (but this would need a big refactor of the router)
let lazyFn: undefined | ((runType: BaseRunType, comp: JitFnCompiler) => JitCode) = undefined;
export function emitToCode(runType: BaseRunType, comp: JitFnCompiler): JitCode {
    if (!lazyFn) lazyFn = createToCodeCompiler();
    return lazyFn(runType, comp);
}
