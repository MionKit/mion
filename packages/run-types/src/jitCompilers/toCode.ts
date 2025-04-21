/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {jitCode} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import {ReflectionKind, TypeMethodSignature} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {isSafePropName} from '@mionkit/run-types/src/lib/utils';
import {_compileJsonStringify} from '@mionkit/run-types/src/jitCompilers/jsonStringify';

/** Centralized compile jit function with a switch statement that handles all node types. */
export function _compileToCode(runType: BaseRunType, comp: JitCompiler, fnId = JitFunctions.toCode.id): jitCode {
    const src = runType.src;
    const kind = src.kind;

    console.log('here', kind, fnId);

    switch (kind) {
        // ###################### ATOMIC RUNTYPES ######################
        case ReflectionKind.symbol:
            return `'Symbol('+'"'+${comp.vλl}.description+'"'+')'`;
        // ###################### MEMBER RUNTYPES ######################
        case ReflectionKind.methodSignature: {
            const srcMS = src as TypeMethodSignature;
            const accessor = srcMS.name;
            const name = String(accessor);
            const isSafe = isSafePropName(accessor);
            const safeName = isSafe ? name : JSON.stringify(name);
            const accessorCode: string = isSafe ? `.${safeName}` : `[${safeName}]`;
            if (runType.src.subKind === ReflectionSubKind.params) {
                const paramsCode = _compileJsonStringify(runType, comp, fnId);
                return `'${safeName}:'+${paramsCode}`;
            } else {
                const fnCode = `${comp.vλl}${accessorCode}.toString()`;
                return `'${safeName}:'+${fnCode}`;
            }
        }
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                return _compileJsonStringify(runType, comp, fnId);
            } else {
                return `${comp.vλl}.toString()`;
            }
        // ###################### COLLECTION RUNTYPES ######################
        case ReflectionKind.class: {
            const result = _compileJsonStringify(runType, comp, fnId);
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return `'new Date('+${result}+')'`;
                case ReflectionSubKind.map: {
                    return `'new Map('+${result}+')'`;
                }
                case ReflectionSubKind.set: {
                    return `'new Set('+${result}+')'`;
                }
                case ReflectionSubKind.nonSerializable:
                    throw new Error(`Jit compilation disabled for Non Serializable types.`);
                default: {
                    // classes are serialized as objects rather that the class itself
                    return;
                }
            }
        }

        default:
            return _compileJsonStringify(runType, comp, fnId);
    }
}
