/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind';
import type {jitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import {compileAddPureFunctionWithClosure, type BaseCompiler} from '../../lib/jitCompiler';
import type {LiteralRunType} from '../../runType/atomic/literal';
import {jitBinarySerializerArgs, JitFunctions} from '../../constants.functions';
import {mionBinSerEnum, mionBinSerNumber, mionBinSerString} from './binaryPureFns';

type BinaryCompiler = BaseCompiler<typeof jitBinarySerializerArgs, typeof JitFunctions.toBinary.id>;

/**
 * Main Binary serialization compiler function
 * Generates JIT code to serialize values to Binary format following Binary 1.1 specification
 *
 * This function generates JavaScript expressions that return Uint8Array containing Binary bytes.
 */
export function _compileToBinary(runType: BaseRunType, comp: BinaryCompiler): jitCode {
    const src = runType.src;
    const kind = src.kind;
    const sεr = comp.args.sεr;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            throw new Error('Binary serialization not supported for unknown/any types');
        case ReflectionKind.null:
            return `${sεr}.uint32Array[${sεr}.index++] = 0`;
        case ReflectionKind.boolean:
            return `${sεr}.uint32Array[${sεr}.index++] = (${comp.vλl}) ? 1 : 0`;
        case ReflectionKind.number: {
            const serializeNumberFn = compileAddPureFunctionWithClosure(comp, mionBinSerNumber);
            return `${serializeNumberFn}(${sεr}, ${comp.vλl})`;
        }
        case ReflectionKind.string: {
            const serializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinSerString);
            return `${serializeStringFn}(${sεr}, ${comp.vλl})`;
        }
        case ReflectionKind.bigint: {
            const serializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinSerString);
            return `${serializeStringFn}(${sεr}, ${comp.vλl}.toString())`;
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return `${sεr}.uint32Array[${sεr}.index++] = -1`;
        case ReflectionKind.symbol: {
            const serializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinSerString);
            return `${serializeStringFn}(${sεr}, ${comp.vλl}.description || '')`;
        }
        case ReflectionKind.regexp: {
            const serializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinSerString);
            return `${serializeStringFn}(${sεr}, ${comp.vλl}.source);${serializeStringFn}(${sεr}, ${comp.vλl}.flags)`;
        }
        case ReflectionKind.object:
            throw new Error('Binary serialization not supported for generic object types');
        case ReflectionKind.enum: {
            const serializeEnumFn = compileAddPureFunctionWithClosure(comp, mionBinSerEnum);
            return `${serializeEnumFn}(${sεr}, ${comp.vλl})`;
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary serialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be serialized to Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary serialization');
        case ReflectionKind.literal:
            return compileLiteral(runType as LiteralRunType, comp);

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array:
            // TODO
            break;

        case ReflectionKind.indexSignature:
            // TODO
            break;

        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                // TODO: Handle function parameters
                break;
            } else {
                throw new Error(
                    'Binary serialization not supported for function types, call compileParams or compileReturn instead'
                );
            }

        case ReflectionKind.parameter:
            switch (src.subKind) {
                case ReflectionSubKind.mapKey:
                    // TODO: Handle map key parameter
                    break;
                case ReflectionSubKind.mapValue:
                    // TODO: Handle map value parameter
                    break;
                case ReflectionSubKind.setItem:
                    // TODO: Handle set item parameter
                    break;
                default:
                    // TODO: Handle regular parameter
                    break;
            }
            break;

        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
            // TODO
            break;

        case ReflectionKind.rest:
            // TODO
            break;

        case ReflectionKind.tupleMember:
            // TODO
            break;

        case ReflectionKind.promise:
            throw new Error('Binary serialization not supported for Promise types');

        // ###################### COLLECTION RUNTYPES ######################
        // Types that contain other types as members
        case ReflectionKind.objectLiteral:
        case ReflectionKind.intersection:
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error('Binary serialization is disabled for Non Serializable types');
            } else {
                // TODO: Handle object literal/intersection
                break;
            }

        case ReflectionKind.class:
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    // TODO: Handle Date class
                    break;
                case ReflectionSubKind.map:
                    // TODO: Handle Map class
                    break;
                case ReflectionSubKind.set:
                    // TODO: Handle Set class
                    break;
                case ReflectionSubKind.nonSerializable:
                    throw new Error('Binary serialization disabled for Non Serializable types');
                default:
                    // TODO: Handle regular class
                    break;
            }
            break;

        case ReflectionKind.infer:
            throw new Error('Infer is not supported in Binary serialization');

        case ReflectionKind.tuple:
            // TODO
            break;

        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in Binary serialization');

        case ReflectionKind.union:
            // TODO
            break;

        default:
            throw new Error(`Binary serialization not supported for ${ReflectionKind[kind]} types`);
    }
}

function compileLiteral(runType: LiteralRunType, comp: BinaryCompiler): jitCode {
    const src = runType.src;
    // Literal types are serialized as their underlying value
    const literalValue = src.literal;
    const originalKind = src.kind;
    // Handle RegExp literals specially
    if (literalValue instanceof RegExp) {
        (src as any).kind = ReflectionKind.regexp;
    } else if (typeof literalValue === 'string') {
        (src as any).kind = ReflectionKind.string;
    } else if (typeof literalValue === 'number') {
        (src as any).kind = ReflectionKind.number;
    } else if (typeof literalValue === 'boolean') {
        (src as any).kind = ReflectionKind.boolean;
    } else if (typeof literalValue === 'bigint') {
        (src as any).kind = ReflectionKind.bigint;
    } else if (typeof literalValue === 'symbol') {
        (src as any).kind = ReflectionKind.symbol;
    } else if (literalValue === null) {
        (src as any).kind = ReflectionKind.null;
    } else {
        // Fallback to string for unknown types
        (src as any).kind = ReflectionKind.string;
    }
    // Recursively call the main function with the changed kind
    const result = _compileToBinary(runType, comp);
    // Restore the original kind
    (src as any).kind = originalKind;
    return result;
}
