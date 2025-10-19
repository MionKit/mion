/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind';
import type {JitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {LiteralRunType} from '../../runType/atomic/literal';

/**
 * Main XYZ deserialization compiler function
 * Generates JIT code to deserialize XYZ data to JavaScript values
 */
function _compileFromXYZ(runType: BaseRunType, comp: JitXYZCompiler): JitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            // TODO
            break;
        case ReflectionKind.null:
            // TODO
            break;
        case ReflectionKind.boolean:
            // TODO
            break;
        case ReflectionKind.number:
            // TODO
            break;
        case ReflectionKind.string:
            // TODO
            break;
        case ReflectionKind.bigint:
            // TODO
            break;
        case ReflectionKind.undefined:
            // TODO
            break;
        case ReflectionKind.void:
            // TODO
            break;

        case ReflectionKind.symbol:
            // TODO
            break;

        case ReflectionKind.regexp:
            // TODO
            break;

        case ReflectionKind.object:
            throw new Error('XYZ deserialization not supported for generic object types');

        case ReflectionKind.enum:
            // TODO
            break;

        case ReflectionKind.enumMember:
            throw new Error('XYZ deserialization not supported for enum member types');

        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from XYZ');

        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in XYZ deserialization');

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
                    'XYZ deserialization not supported for function types, call compileParams or compileReturn instead'
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
            throw new Error('XYZ deserialization not supported for Promise types');

        // ###################### COLLECTION RUNTYPES ######################
        // Types that contain other types as members
        case ReflectionKind.objectLiteral:
        case ReflectionKind.intersection:
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error('XYZ deserialization is disabled for Non Serializable types');
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
                    throw new Error('XYZ deserialization disabled for Non Serializable types');
                default:
                    // TODO: Handle regular class
                    break;
            }
            break;

        case ReflectionKind.infer:
            throw new Error('Infer is not supported in XYZ deserialization');

        case ReflectionKind.tuple:
            // TODO
            break;

        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in XYZ deserialization');

        case ReflectionKind.union:
            // TODO
            break;

        default:
            throw new Error(`XYZ deserialization not supported for ${ReflectionKind[kind]} types`);
    }
}

function compileLiteral(runType: LiteralRunType, comp: JitXYZCompiler): JitCode {
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
    const result = _compileFromXYZ(runType, comp);
    // Restore the original kind
    (src as any).kind = originalKind;
    return result;
}
