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
import {ReflectionKind, TypeMethodSignature} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {isSafePropName} from '@mionkit/run-types/src/lib/utils';
import {_compileJsonStringify, _compileJsonStringifyIterable} from '@mionkit/run-types/src/jitCompilers/jsonStringify';

/** Centralized compile jit function with a switch statement that handles all node types. */
export function _compileToCode(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.toCode.id): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC RUNTYPES ######################
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
            const accessorCode: string = isSafe ? `.${safeName}` : `[${safeName}]`;
            const sep = rt.skipCommas ? '' : '+","';
            if (rt.src.subKind === ReflectionSubKind.params) {
                const paramsCode = _compileJsonStringify(rt, comp, fnID);
                return `'${safeName}:'+${paramsCode}${sep}`;
            } else {
                const fnCode = `${comp.vλl}${accessorCode}.toString()`;
                return `'${safeName}:'+${fnCode}${sep}`;
            }
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                return _compileJsonStringify(runType, comp, fnID);
            } else {
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
