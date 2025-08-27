/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {jitCode, JitFnID} from '../types';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler} from '../lib/jitCompiler';
import {JitFunctions} from '../constants.functions';
import type {ArrayRunType} from '../runType/collection/array';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {ClassRunType} from '../runType/collection/class';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {UnionRunType} from '../runType/collection/union';
import {BSON_TYPES} from './bsonUtils';

/**
 * Main BSON deserialization compiler function
 * Generates JIT code to deserialize BSON data to JavaScript values
 */
export function _compileFromBSON(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.fromBSON.id): jitCode {
    // The input is always a Uint8Array containing BSON data
    const readerVar = `reader${comp.getNestLevel(runType)}`;
    const typeVar = `bsonType${comp.getNestLevel(runType)}`;

    return `
        const ${readerVar} = new (${getBSONReaderClass()})${comp.vλl});
        const ${typeVar} = ${readerVar}.readUInt8();
        ${generateTypeSwitch(runType, comp, fnID, readerVar, typeVar)}
    `;
}

/**
 * Generate a switch statement for BSON type handling
 */
function generateTypeSwitch(runType: BaseRunType, comp: JitCompiler, fnID: JitFnID, readerVar: string, typeVar: string): jitCode {
    const kind = runType.src.kind;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.null:
            return `
                if (${typeVar} !== ${BSON_TYPES.NULL}) {
                    throw new Error('Expected BSON null type, got ' + ${typeVar});
                }
                return null;
            `;

        case ReflectionKind.boolean:
            return `
                if (${typeVar} !== ${BSON_TYPES.BOOLEAN}) {
                    throw new Error('Expected BSON boolean type, got ' + ${typeVar});
                }
                return ${readerVar}.readUInt8() === 1;
            `;

        case ReflectionKind.number:
            return `
                if (${typeVar} === ${BSON_TYPES.INT32}) {
                    return ${readerVar}.readInt32LE();
                } else if (${typeVar} === ${BSON_TYPES.INT64}) {
                    const bigIntVal = ${readerVar}.readInt64LE();
                    return Number(bigIntVal);
                } else if (${typeVar} === ${BSON_TYPES.DOUBLE}) {
                    return ${readerVar}.readDoubleLE();
                } else {
                    throw new Error('Expected BSON number type, got ' + ${typeVar});
                }
            `;

        case ReflectionKind.string:
            return `
                if (${typeVar} !== ${BSON_TYPES.STRING}) {
                    throw new Error('Expected BSON string type, got ' + ${typeVar});
                }
                return ${readerVar}.readString();
            `;

        case ReflectionKind.bigint:
            return `
                if (${typeVar} !== ${BSON_TYPES.INT64}) {
                    throw new Error('Expected BSON int64 type, got ' + ${typeVar});
                }
                return ${readerVar}.readInt64LE();
            `;

        case ReflectionKind.literal: {
            // For literal types, deserialize and validate the value
            const literalValue = runType.src.literal;
            const deserializeCode = generateLiteralDeserialization(literalValue, readerVar, typeVar);
            return `
                ${deserializeCode}
                if (result !== ${JSON.stringify(literalValue)}) {
                    throw new Error('Expected literal value ${JSON.stringify(literalValue)}, got ' + result);
                }
                return result;
            `;
        }

        // ###################### COLLECTION TYPES ######################
        case ReflectionKind.array:
            return compileArrayDeserialization(runType as ArrayRunType, comp, fnID, readerVar, typeVar);

        case ReflectionKind.object:
        case ReflectionKind.objectLiteral:
            return compileObjectDeserialization(runType, comp, fnID, readerVar, typeVar);

        case ReflectionKind.class:
            return compileClassDeserialization(runType as ClassRunType, comp, fnID, readerVar, typeVar);

        case ReflectionKind.union:
            return compileUnionDeserialization(runType as UnionRunType, comp, fnID, readerVar, typeVar);

        // ###################### NATIVE TYPES ######################
        case ReflectionKind.map:
            return compileMapDeserialization(runType as MapRunType, comp, fnID, readerVar, typeVar);

        case ReflectionKind.set:
            return compileSetDeserialization(runType as SetRunType, comp, fnID, readerVar, typeVar);

        case ReflectionKind.date:
            return `
                if (${typeVar} !== ${BSON_TYPES.INT64}) {
                    throw new Error('Expected BSON int64 type for Date, got ' + ${typeVar});
                }
                const timestamp = ${readerVar}.readInt64LE();
                return new Date(Number(timestamp));
            `;

        default:
            // Fallback: try to deserialize as string
            return `
                if (${typeVar} !== ${BSON_TYPES.STRING}) {
                    throw new Error('Unsupported BSON type: ' + ${typeVar});
                }
                return ${readerVar}.readString();
            `;
    }
}

/**
 * Generate literal value deserialization
 */
function generateLiteralDeserialization(literalValue: any, readerVar: string, typeVar: string): jitCode {
    if (typeof literalValue === 'string') {
        return `
            if (${typeVar} !== ${BSON_TYPES.STRING}) {
                throw new Error('Expected BSON string type for literal, got ' + ${typeVar});
            }
            const result = ${readerVar}.readString();
        `;
    } else if (typeof literalValue === 'number') {
        return `
            let result;
            if (${typeVar} === ${BSON_TYPES.INT32}) {
                result = ${readerVar}.readInt32LE();
            } else if (${typeVar} === ${BSON_TYPES.INT64}) {
                result = Number(${readerVar}.readInt64LE());
            } else if (${typeVar} === ${BSON_TYPES.DOUBLE}) {
                result = ${readerVar}.readDoubleLE();
            } else {
                throw new Error('Expected BSON number type for literal, got ' + ${typeVar});
            }
        `;
    } else if (typeof literalValue === 'boolean') {
        return `
            if (${typeVar} !== ${BSON_TYPES.BOOLEAN}) {
                throw new Error('Expected BSON boolean type for literal, got ' + ${typeVar});
            }
            const result = ${readerVar}.readUInt8() === 1;
        `;
    } else if (literalValue === null) {
        return `
            if (${typeVar} !== ${BSON_TYPES.NULL}) {
                throw new Error('Expected BSON null type for literal, got ' + ${typeVar});
            }
            const result = null;
        `;
    }
    return `const result = String(${literalValue});`;
}

/**
 * Compile array deserialization
 */
function compileArrayDeserialization(
    runType: ArrayRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    readerVar: string,
    typeVar: string
): jitCode {
    const memberChild = runType.getJitChild(comp);
    const arrayVar = `array${comp.getNestLevel(runType)}`;
    const docSizeVar = `docSize${comp.getNestLevel(runType)}`;
    const endPosVar = `endPos${comp.getNestLevel(runType)}`;

    if (!memberChild) {
        return `
            if (${typeVar} !== ${BSON_TYPES.ARRAY}) {
                throw new Error('Expected BSON array type, got ' + ${typeVar});
            }
            const ${docSizeVar} = ${readerVar}.readInt32LE();
            ${readerVar}.setPosition(${readerVar}.getPosition() + ${docSizeVar} - 4);
            return [];
        `;
    }

    return `
        if (${typeVar} !== ${BSON_TYPES.ARRAY}) {
            throw new Error('Expected BSON array type, got ' + ${typeVar});
        }
        const ${docSizeVar} = ${readerVar}.readInt32LE();
        const ${endPosVar} = ${readerVar}.getPosition() + ${docSizeVar} - 4;
        const ${arrayVar} = [];
        
        while (${readerVar}.getPosition() < ${endPosVar} - 1) {
            const elemType = ${readerVar}.readUInt8();
            const key = ${readerVar}.readCString(); // Array index as string
            
            // Create a new reader for the element data
            const elemData = ${generateElementDeserialization(memberChild, comp, fnID, 'elemType')};
            ${arrayVar}.push(elemData);
        }
        
        // Skip document terminator
        ${readerVar}.readUInt8();
        return ${arrayVar};
    `;
}

/**
 * Compile object deserialization
 */
function compileObjectDeserialization(
    runType: BaseRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    readerVar: string,
    typeVar: string
): jitCode {
    const rt = runType as InterfaceRunType;
    const children = rt.getJitChildren(comp);
    const objVar = `obj${comp.getNestLevel(runType)}`;
    const docSizeVar = `docSize${comp.getNestLevel(runType)}`;
    const endPosVar = `endPos${comp.getNestLevel(runType)}`;

    return `
        if (${typeVar} !== ${BSON_TYPES.DOCUMENT}) {
            throw new Error('Expected BSON document type, got ' + ${typeVar});
        }
        const ${docSizeVar} = ${readerVar}.readInt32LE();
        const ${endPosVar} = ${readerVar}.getPosition() + ${docSizeVar} - 4;
        const ${objVar} = {};
        
        while (${readerVar}.getPosition() < ${endPosVar} - 1) {
            const fieldType = ${readerVar}.readUInt8();
            const fieldName = ${readerVar}.readCString();
            
            ${generateFieldDeserialization(children, comp, fnID, objVar, 'fieldName', 'fieldType')}
        }
        
        // Skip document terminator
        ${readerVar}.readUInt8();
        return ${objVar};
    `;
}

/**
 * Generate field deserialization for object properties
 */
function generateFieldDeserialization(
    children: BaseRunType[],
    comp: JitCompiler,
    fnID: JitFnID,
    objVar: string,
    fieldNameVar: string,
    fieldTypeVar: string
): jitCode {
    if (children.length === 0) {
        return `
            // Skip unknown field
            ${generateSkipFieldCode(fieldTypeVar)};
        `;
    }

    const fieldCases = children
        .map((child) => {
            if (child.src.kind === ReflectionKind.property || child.src.kind === ReflectionKind.propertySignature) {
                const propName = (child as any).getPropertyName();
                const deserializationCode = generateElementDeserialization(child.getJitChild(comp), comp, fnID, fieldTypeVar);
                return `
                if (${fieldNameVar} === ${JSON.stringify(propName)}) {
                    ${objVar}[${JSON.stringify(propName)}] = ${deserializationCode};
                    continue;
                }
            `;
            }
            return '';
        })
        .filter(Boolean)
        .join('\n');

    return `
        ${fieldCases}
        // Skip unknown field
        ${generateSkipFieldCode(fieldTypeVar)};
    `;
}

/**
 * Generate element deserialization based on BSON type
 */
function generateElementDeserialization(
    runType: BaseRunType | undefined,
    comp: JitCompiler,
    fnID: JitFnID,
    typeVar: string
): jitCode {
    if (!runType) {
        return `${generateGenericDeserialization(typeVar)}`;
    }

    // For now, use generic deserialization - this could be optimized later
    return `${generateGenericDeserialization(typeVar)}`;
}

/**
 * Generate generic deserialization based on BSON type
 */
function generateGenericDeserialization(typeVar: string): jitCode {
    return `
        (function() {
            switch (${typeVar}) {
                case ${BSON_TYPES.NULL}:
                    return null;
                case ${BSON_TYPES.BOOLEAN}:
                    return ${readerVar}.readUInt8() === 1;
                case ${BSON_TYPES.INT32}:
                    return ${readerVar}.readInt32LE();
                case ${BSON_TYPES.INT64}:
                    return Number(${readerVar}.readInt64LE());
                case ${BSON_TYPES.DOUBLE}:
                    return ${readerVar}.readDoubleLE();
                case ${BSON_TYPES.STRING}:
                    return ${readerVar}.readString();
                case ${BSON_TYPES.BINARY}:
                    const binLength = ${readerVar}.readInt32LE();
                    const subtype = ${readerVar}.readUInt8();
                    return ${readerVar}.readBytes(binLength);
                default:
                    throw new Error('Unsupported BSON type: ' + ${typeVar});
            }
        })()
    `;
}

/**
 * Generate code to skip a field based on its BSON type
 */
function generateSkipFieldCode(typeVar: string): jitCode {
    return `
        switch (${typeVar}) {
            case ${BSON_TYPES.NULL}:
                break; // No data to skip
            case ${BSON_TYPES.BOOLEAN}:
                ${readerVar}.readUInt8();
                break;
            case ${BSON_TYPES.INT32}:
                ${readerVar}.readInt32LE();
                break;
            case ${BSON_TYPES.INT64}:
                ${readerVar}.readInt64LE();
                break;
            case ${BSON_TYPES.DOUBLE}:
                ${readerVar}.readDoubleLE();
                break;
            case ${BSON_TYPES.STRING}:
                ${readerVar}.readString();
                break;
            case ${BSON_TYPES.BINARY}:
                const binLength = ${readerVar}.readInt32LE();
                ${readerVar}.readUInt8(); // subtype
                ${readerVar}.readBytes(binLength);
                break;
            case ${BSON_TYPES.DOCUMENT}:
            case ${BSON_TYPES.ARRAY}:
                const docLength = ${readerVar}.readInt32LE();
                ${readerVar}.readBytes(docLength - 4);
                break;
            default:
                throw new Error('Cannot skip unknown BSON type: ' + ${typeVar});
        }
    `;
}

/**
 * Compile class deserialization (placeholder)
 */
function compileClassDeserialization(
    runType: ClassRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    readerVar: string,
    typeVar: string
): jitCode {
    // For now, treat classes like regular objects
    return compileObjectDeserialization(runType, comp, fnID, readerVar, typeVar);
}

/**
 * Compile union deserialization (placeholder)
 */
function compileUnionDeserialization(
    runType: UnionRunType,
    comp: JitCompiler,
    fnID: JitFnID,
    readerVar: string,
    typeVar: string
): jitCode {
    // For now, try the first variant
    const variants = runType.getVariants();
    if (variants.length > 0) {
        return generateTypeSwitch(variants[0], comp, fnID, readerVar, typeVar);
    }
    return `throw new Error('Empty union type');`;
}

/**
 * Compile Map deserialization (placeholder)
 */
function compileMapDeserialization(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _runType: MapRunType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _comp: JitCompiler,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fnID: JitFnID,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _readerVar: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _typeVar: string
): jitCode {
    return `throw new Error('Map deserialization not yet implemented');`;
}

/**
 * Compile Set deserialization (placeholder)
 */
function compileSetDeserialization(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _runType: SetRunType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _comp: JitCompiler,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fnID: JitFnID,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _readerVar: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _typeVar: string
): jitCode {
    return `throw new Error('Set deserialization not yet implemented');`;
}

/**
 * Get the BSON reader class reference
 */
function getBSONReaderClass(): string {
    // This will be imported from bsonUtils
    return `(function() { 
        const { BSONReader } = require('./bsonUtils'); 
        return BSONReader; 
    })()`;
}
