/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {JitCompiler} from '../../lib/jitCompiler';
import {compileAddPureFunctionWithClosure} from '../../lib/jitCompiler';
// Import pure functions
import {mionWriteNumber, mionWriteBSONString, mionWriteUInt8, mionWriteInt64LE, mionWriteCString} from './bsonWriter';

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
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            throw new Error('BSON serialization not supported for unknown/any types');

        case ReflectionKind.null: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x0a);`;
        }

        case ReflectionKind.boolean: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x08); ${writeUInt8Fn}(${comp.args.ctx}, ${comp.vλl} ? 0x01 : 0x00);`;
        }

        case ReflectionKind.number: {
            const writeNumberFn = compileAddPureFunctionWithClosure(comp, mionWriteNumber);
            return `${writeNumberFn}(${comp.args.ctx}, ${comp.vλl});`;
        }

        case ReflectionKind.string: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            const writeStringFn = compileAddPureFunctionWithClosure(comp, mionWriteBSONString);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x02); ${writeStringFn}(${comp.args.ctx}, ${comp.vλl});`;
        }

        case ReflectionKind.bigint: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            const writeInt64Fn = compileAddPureFunctionWithClosure(comp, mionWriteInt64LE);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x12); ${writeInt64Fn}(${comp.args.ctx}, ${comp.vλl});`;
        }

        case ReflectionKind.undefined: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x0a);`; // Serialize as null
        }

        case ReflectionKind.void: {
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x0a);`; // Serialize as null
        }

        case ReflectionKind.symbol: {
            // Serialize symbol as string representation
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            const writeStringFn = compileAddPureFunctionWithClosure(comp, mionWriteBSONString);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x02); ${writeStringFn}(${comp.args.ctx}, 'Symbol:' + (${comp.vλl}.description || ''));`;
        }

        case ReflectionKind.regexp: {
            // BSON has native regex support (type 0x0b)
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            const writeCStringFn = compileAddPureFunctionWithClosure(comp, mionWriteCString);
            return `${writeUInt8Fn}(${comp.args.ctx}, 0x0b); ${writeCStringFn}(${comp.args.ctx}, ${comp.vλl}.source); ${writeCStringFn}(${comp.args.ctx}, ${comp.vλl}.flags);`;
        }

        case ReflectionKind.object:
            throw new Error('BSON serialization not supported for generic object types');

        case ReflectionKind.enum: {
            // Serialize enum as its underlying value
            const writeNumberFn = compileAddPureFunctionWithClosure(comp, mionWriteNumber);
            const writeUInt8Fn = compileAddPureFunctionWithClosure(comp, mionWriteUInt8);
            const writeStringFn = compileAddPureFunctionWithClosure(comp, mionWriteBSONString);
            return `if (typeof ${comp.vλl} === 'number') { ${writeNumberFn}(${comp.args.ctx}, ${comp.vλl}); } else { ${writeUInt8Fn}(${comp.args.ctx}, 0x02); ${writeStringFn}(${comp.args.ctx}, ${comp.vλl}); }`;
        }

        case ReflectionKind.enumMember:
            throw new Error('BSON serialization not supported for enum member types');

        case ReflectionKind.never:
            throw new Error('Never type cannot be serialized to BSON');

        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in BSON serialization');

        case ReflectionKind.literal: {
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
            const result = _compileToBSON(runType, comp);

            // Restore the original kind
            (src as any).kind = originalKind;

            return result;
        }

        default:
            throw new Error(`BSON serialization not supported for ${ReflectionKind[kind]} types`);
    }
}
