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
import {mionReadUInt8, mionReadNumber, mionReadBSONString, mionReadInt64LE, mionReadCString} from './bsonReader';
/**
 * Main BSON deserialization compiler function
 * Generates JIT code to deserialize BSON data to JavaScript values
 */
export function _compileFromBSON(runType: BaseRunType, comp: JitCompiler): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            throw new Error('BSON deserialization not supported for unknown/any types');

        case ReflectionKind.null: {
            const readUInt8Fn = compileAddPureFunctionWithClosure(comp, mionReadUInt8);
            return `${readUInt8Fn}(${comp.args.cTx}); return null;`;
        }

        case ReflectionKind.boolean: {
            const readUInt8Fn = compileAddPureFunctionWithClosure(comp, mionReadUInt8);
            return `${readUInt8Fn}(${comp.args.cTx}); return ${comp.args.cTx}.value === 1;`;
        }

        case ReflectionKind.number: {
            const readNumberFn = compileAddPureFunctionWithClosure(comp, mionReadNumber);
            return `${readNumberFn}(${comp.args.cTx}, ${comp.args.bsonType}); return ${comp.args.cTx}.value;`;
        }

        case ReflectionKind.string: {
            const readStringFn = compileAddPureFunctionWithClosure(comp, mionReadBSONString);
            return `${readStringFn}(${comp.args.cTx}); return ${comp.args.cTx}.value;`;
        }

        case ReflectionKind.bigint: {
            const readInt64Fn = compileAddPureFunctionWithClosure(comp, mionReadInt64LE);
            return `${readInt64Fn}(${comp.args.cTx}); return ${comp.args.cTx}.value;`;
        }

        case ReflectionKind.undefined: {
            const readUInt8Fn = compileAddPureFunctionWithClosure(comp, mionReadUInt8);
            return `${readUInt8Fn}(${comp.args.cTx}); return undefined;`; // Read null but return undefined
        }

        case ReflectionKind.void: {
            const readUInt8Fn = compileAddPureFunctionWithClosure(comp, mionReadUInt8);
            return `${readUInt8Fn}(${comp.args.cTx}); return undefined;`; // Read null but return undefined
        }

        case ReflectionKind.symbol: {
            // Read symbol as string representation
            const readStringFn = compileAddPureFunctionWithClosure(comp, mionReadBSONString);
            return `${readStringFn}(${comp.args.cTx}); const desc = ${comp.args.cTx}.value.replace('Symbol:', ''); return Symbol(desc || undefined);`;
        }

        case ReflectionKind.regexp: {
            // BSON has native regex support (type 0x0b)
            const readCStringFn = compileAddPureFunctionWithClosure(comp, mionReadCString);
            return `${readCStringFn}(${comp.args.cTx}); const source = ${comp.args.cTx}.value; ${readCStringFn}(${comp.args.cTx}); const flags = ${comp.args.cTx}.value; return new RegExp(source, flags);`;
        }

        case ReflectionKind.object:
            throw new Error('BSON deserialization not supported for generic object types');

        case ReflectionKind.enum: {
            // Deserialize enum based on BSON type
            const readNumberFn = compileAddPureFunctionWithClosure(comp, mionReadNumber);
            const readStringFn = compileAddPureFunctionWithClosure(comp, mionReadBSONString);
            return `if (${comp.args.bsonType} === 0x02) { ${readStringFn}(${comp.args.cTx}); return ${comp.args.cTx}.value; } else { ${readNumberFn}(${comp.args.cTx}, ${comp.args.bsonType}); return ${comp.args.cTx}.value; }`;
        }

        case ReflectionKind.enumMember:
            throw new Error('BSON deserialization not supported for enum member types');

        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from BSON');

        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in BSON deserialization');

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
            const result = _compileFromBSON(runType, comp);

            // Restore the original kind
            (src as any).kind = originalKind;

            return result;
        }

        default:
            throw new Error(`BSON deserialization not supported for ${ReflectionKind[kind]} types`);
    }
}
