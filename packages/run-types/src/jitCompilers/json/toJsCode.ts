/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {ClassRunType} from '../../nodes/collection/class';
import type {MethodSignatureRunType} from '../../nodes/member/methodSignature';
import type {IterableRunType} from '../../nodes/native/Iterable';
import {ReflectionKind, type TypeMethodSignature, type TypePropertySignature} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind';
import {JitFunctions} from '../../constants.functions';
import {JitFnCompiler} from '../../lib/jitFnCompiler';
import {isSafePropName} from '../../lib/utils';
import {createStringifyCompiler, createStringifyIterable} from './jsonStringify';
import {registerPureFnClosure} from '../../lib/pureFn';

export function createToCodeCompiler() {
    const fnID = JitFunctions.toJavascript.id;
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
                if (isCompilingJitFn(rt, comp)) {
                    // special case for JitFunctions that we know should return undefined for fn param
                    return {code: `'undefined'`, type: 'E'};
                } else if (isCompilingClosureJitFn(rt, comp)) {
                    // This is an special case for JitFunctions where we want to generate the fn from the JitCompiledFnData instead of fn.toString();
                    const fnName = comp.opts.isPureFnCode ? `${comp.vλl}.pureFnHash` : `${comp.vλl}.jitFnHash`;
                    const fnCode = `${comp.vλl}.code`;
                    const closureCode = `'function get_'+${fnName}+'(utl){'+${fnCode}+'}'`;
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
                    const fnName = comp.addPureFunction(sanitizeCompiledFn);
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

    function isCompilingClosureJitFn(runType: MethodSignatureRunType, comp: JitFnCompiler) {
        if (!comp.opts.isJitFnCode && !comp.opts.isPureFnCode) return false;
        const isClosure = runType.getChildVarName(comp) === 'createJitFn';
        return isClosure;
    }

    function isCompilingJitFn(runType: MethodSignatureRunType, comp: JitFnCompiler) {
        if (!comp.opts.isJitFnCode && !comp.opts.isPureFnCode) return false;
        const isFn = runType.getChildVarName(comp) === 'fn';
        return isFn;
    }

    return compileToCode;
}

/** @reflection never */
export function sanitizeCompiledFn() {
    const anonymousRegex = /^\s*function\s+anonymous\s*\(/;
    return function sanitizeCompiled(fnCode: string): string {
        if (anonymousRegex.test(fnCode)) {
            return fnCode.replace(anonymousRegex, 'function (');
        }
        return fnCode;
    };
}

registerPureFnClosure(sanitizeCompiledFn);

// lazy loading as this function wont be used often just for (AOT)
// TODO move to async code loading (but this would need a big refactor of the router)
let lazyFn: undefined | ((runType: BaseRunType, comp: JitFnCompiler) => JitCode) = undefined;
export function emitToCode(runType: BaseRunType, comp: JitFnCompiler): JitCode {
    if (!lazyFn) lazyFn = createToCodeCompiler();
    return lazyFn(runType, comp);
}
