/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {JitBinaryCompiler} from '../../lib/jitCompiler';

/**
 * Main Binary deserialization compiler function
 * Generates JIT code to deserialize Binary data to JavaScript values
 */
export function _compileFromBinary(runType: BaseRunType, comp: JitBinaryCompiler): jitCode {
    // Get type validation function once
    return _compileFromBinaryType(runType, comp);
}

function _compileFromBinaryType(runType: BaseRunType, comp: JitBinaryCompiler): jitCode {
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
            throw new Error('Binary deserialization not supported for generic object types');

        case ReflectionKind.enum:
            // TODO
            break;

        case ReflectionKind.enumMember:
            throw new Error('Binary deserialization not supported for enum member types');

        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from Binary');

        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary deserialization');

        case ReflectionKind.literal: {
            // Literal types are deserialized based on their underlying type
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
            const result = _compileFromBinaryType(runType, comp);

            // Restore the original kind
            (src as any).kind = originalKind;

            return result;
        }

        default:
            throw new Error(`Binary deserialization not supported for ${ReflectionKind[kind]} types`);
    }
}
