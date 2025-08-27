/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {jitCode} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler} from '../lib/jitCompiler';

/**
 * Main BSON serialization compiler function
 * Generates JIT code to serialize values to BSON format following BSON 1.1 specification
 *
 * This function generates JavaScript expressions that return Uint8Array containing BSON bytes.
 */
export function _compileToBSON(runType: BaseRunType, comp: JitCompiler): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.null:
            // BSON null type (0x0a) - no data follows
            return `new Uint8Array([0x0a])`;

        case ReflectionKind.boolean:
            // BSON boolean type (0x08) + 1 byte for value (0x00 = false, 0x01 = true)
            return `new Uint8Array([0x08, ${comp.vλl} ? 0x01 : 0x00])`;

        case ReflectionKind.number:
            return generateNumberSerialization(comp.vλl, comp, runType);

        case ReflectionKind.string:
            return generateStringSerialization(comp.vλl, comp, runType);

        case ReflectionKind.bigint:
            return generateBigIntSerialization(comp.vλl, comp, runType);

        case ReflectionKind.literal: {
            // Literal types are serialized as their underlying value
            const literalValue = src.literal;
            if (typeof literalValue === 'string') {
                return generateStringSerialization(JSON.stringify(literalValue), comp, runType);
            } else if (typeof literalValue === 'number') {
                return generateNumberSerialization(JSON.stringify(literalValue), comp, runType);
            } else if (typeof literalValue === 'boolean') {
                return `new Uint8Array([0x08, ${literalValue} ? 0x01 : 0x00])`;
            } else if (literalValue === null) {
                return `new Uint8Array([0x0a])`;
            }
            return generateStringSerialization(JSON.stringify(String(literalValue)), comp, runType);
        }

        default:
            throw new Error(`BSON serialization not supported for ${ReflectionKind[kind]} types`);
    }
}

/**
 * Generate number serialization code with type detection
 * Numbers are serialized as int32, int64, or double based on their value and type
 */
function generateNumberSerialization(valueExpr: string, comp: JitCompiler, runType: BaseRunType): jitCode {
    const valVar = `val_${comp.getNestLevel(runType)}`;
    const bufferVar = `buffer_${comp.getNestLevel(runType)}`;
    const viewVar = `view_${comp.getNestLevel(runType)}`;

    return `(function() {
        const ${valVar} = ${valueExpr};
        if (Number.isInteger(${valVar}) && ${valVar} >= -2147483648 && ${valVar} <= 2147483647) {
            // BSON int32 (0x10) + 4 bytes little-endian
            const ${bufferVar} = new Uint8Array(5);
            ${bufferVar}[0] = 0x10;
            const ${viewVar} = new DataView(${bufferVar}.buffer);
            ${viewVar}.setInt32(1, ${valVar}, true);
            return ${bufferVar};
        } else if (Number.isInteger(${valVar})) {
            // BSON int64 (0x12) + 8 bytes little-endian
            const ${bufferVar} = new Uint8Array(9);
            ${bufferVar}[0] = 0x12;
            const ${viewVar} = new DataView(${bufferVar}.buffer);
            ${viewVar}.setBigInt64(1, BigInt(${valVar}), true);
            return ${bufferVar};
        } else {
            // BSON double (0x01) + 8 bytes little-endian
            const ${bufferVar} = new Uint8Array(9);
            ${bufferVar}[0] = 0x01;
            const ${viewVar} = new DataView(${bufferVar}.buffer);
            ${viewVar}.setFloat64(1, ${valVar}, true);
            return ${bufferVar};
        }
    })()`;
}

/**
 * Generate string serialization code
 * Strings are serialized as BSON string type (0x02) + length + UTF-8 bytes + null terminator
 */
function generateStringSerialization(valueExpr: string, comp: JitCompiler, runType: BaseRunType): jitCode {
    const utf8Var = `utf8_${comp.getNestLevel(runType)}`;
    const lengthVar = `length_${comp.getNestLevel(runType)}`;
    const bufferVar = `buffer_${comp.getNestLevel(runType)}`;
    const viewVar = `view_${comp.getNestLevel(runType)}`;

    return `(function() {
        const ${utf8Var} = new TextEncoder().encode(${valueExpr});
        const ${lengthVar} = ${utf8Var}.length + 1; // include null terminator

        // Create buffer: type (1) + length (4) + UTF-8 bytes + null terminator (1)
        const ${bufferVar} = new Uint8Array(1 + 4 + ${utf8Var}.length + 1);

        // BSON string type (0x02)
        ${bufferVar}[0] = 0x02;

        // Write string length (4 bytes little-endian)
        const ${viewVar} = new DataView(${bufferVar}.buffer);
        ${viewVar}.setInt32(1, ${lengthVar}, true);

        // Write UTF-8 bytes
        ${bufferVar}.set(${utf8Var}, 5);

        // Write null terminator
        ${bufferVar}[${bufferVar}.length - 1] = 0;

        return ${bufferVar};
    })()`;
}

/**
 * Generate bigint serialization code
 * BigInts are serialized as BSON int64 type (0x12) + 8 bytes little-endian
 */
function generateBigIntSerialization(valueExpr: string, comp: JitCompiler, runType: BaseRunType): jitCode {
    const bufferVar = `buffer_${comp.getNestLevel(runType)}`;
    const viewVar = `view_${comp.getNestLevel(runType)}`;

    return `(function() {
        // Create buffer: type (1) + bigint value (8)
        const ${bufferVar} = new Uint8Array(9);

        // BSON int64 type (0x12)
        ${bufferVar}[0] = 0x12;

        // Write bigint value (8 bytes little-endian)
        const ${viewVar} = new DataView(${bufferVar}.buffer);
        ${viewVar}.setBigInt64(1, ${valueExpr}, true);

        return ${bufferVar};
    })()`;
}
