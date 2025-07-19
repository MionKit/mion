/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {jitCode} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {MapRunType} from '@mionkit/run-types/src/runType/native/map';
import type {SetRunType} from '@mionkit/run-types/src/runType/native/set';
import type {ClassRunType} from '@mionkit/run-types/src/runType/collection/class';
import type {MethodSignatureRunType} from '@mionkit/run-types/src/runType/member/methodSignature';
import {ReflectionKind, type TypeMethodSignature, type TypePropertySignature} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {compileAddPureFunctionWithClosure, JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {isSafePropName} from '@mionkit/run-types/src/lib/utils';
import {_compileJsonStringify, _compileJsonStringifyIterable} from '@mionkit/run-types/src/jitFnsCompilers/jsonStringify';
import {registerPureFnClosure} from '@mionkit/run-types/src/lib/formats';

/** Centralized compile jit function with a switch statement that handles all node types. */
export function _compileToCode(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.toCode.id): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC RUNTYPES ######################
        case ReflectionKind.undefined:
            return `'undefined'`;
        case ReflectionKind.symbol:
            return `'Symbol('+'"'+${comp.vλl}.description+'"'+')'`;
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
                return `'undefined'`;
            } else if (isCompilingClosureJitFn(rt, comp)) {
                // This is an special case for JitFunctions where we want to generate the fn from the JitCompiledFnData instead of fn.toString();
                const fnName = comp.opts.isPureFnCode ? `${comp.vλl}.pureFnHash` : `${comp.vλl}.jitFnHash`;
                const fnCode = `${comp.vλl}.code`;
                const closureCode = `'function closure_'+${fnName}+'(utl){'+${fnCode}+'}'`;
                return `'${safeName}:'+${closureCode}${sep}`;
            } else if (rt.src.subKind === ReflectionSubKind.params) {
                const paramsCode = _compileJsonStringify(rt, comp, fnID);
                if (rt.isOptional()) return `(${comp.getChildVλl()} === undefined ? "" : '${safeName}:'+${paramsCode}${sep})`;
                return `'${safeName}:'+${paramsCode}${sep}`;
            } else {
                const fnName = compileAddPureFunctionWithClosure(comp, sanitizeCompiledFn);
                const parent = srcMS.parent as any as TypePropertySignature;

                // in some scenarios the parent is a propertySignature instead the Expected TypeObjectLiteral so we have to handle that
                // this seems to be a deepkit bug when using omit and then redefining the property @see SrcCodeJitCompiledFn type
                const isDuplicatedChild = parent?.kind === ReflectionKind.propertySignature && parent?.name === srcMS.name;
                if (isDuplicatedChild) return `${fnName}(${comp.vλl}.toString())`;
                const accessorCode = isSafe ? `.${safeName}` : `[${safeName}]`;
                const fnCode = `${fnName}(${comp.vλl}${accessorCode}.toString())`;
                if (rt.isOptional()) return `(${comp.getChildVλl()} === undefined ? "" : '${safeName}:'+${fnCode}${sep})`;
                return `'${safeName}:'+${fnCode}${sep}`;
            }
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                return _compileJsonStringify(runType, comp, fnID);
            } else {
                // TODO: we are relying in fn.toString() to generate code, this might not work properly in all js engines
                return `${comp.vλl}.toString()`;
            }
        // ###################### COLLECTION RUNTYPES ######################
        case ReflectionKind.class: {
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return `'new Date('+${_compileJsonStringify(runType, comp, fnID)}+')'`;
                case ReflectionSubKind.map: {
                    return _compileJsonStringifyIterable(runType as MapRunType, comp, fnID, 'new Map(', ')');
                }
                case ReflectionSubKind.set: {
                    return _compileJsonStringifyIterable(runType as SetRunType, comp, fnID, 'new Set(', ')');
                }
                case ReflectionSubKind.nonSerializable:
                    throw new Error(`Can not generate code for Non Serializable types.`);
                default: {
                    const rt = runType as ClassRunType;
                    throw new Error(`Can not generate code for classes. Class: ${rt.getClassName()}`);
                }
            }
        }
        default:
            return _compileJsonStringify(runType, comp, fnID);
    }
}

function isCompilingClosureJitFn(runType: MethodSignatureRunType, comp: JitCompiler) {
    if (!comp.opts.isJitFnCode && !comp.opts.isPureFnCode) return false;
    const isClosure = runType.getChildVarName() === 'closureFn';
    return isClosure;
}

function isCompilingJitFn(runType: MethodSignatureRunType, comp: JitCompiler) {
    if (!comp.opts.isJitFnCode && !comp.opts.isPureFnCode) return false;
    const isFn = runType.getChildVarName() === 'fn';
    return isFn;
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
