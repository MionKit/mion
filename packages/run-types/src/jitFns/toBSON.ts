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
import type {PropertyRunType} from '../runType/member/property';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {ClassRunType} from '../runType/collection/class';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {UnionRunType} from '../runType/collection/union';
import {ReflectionSubKind} from '../constants.kind';

/**
 * Main BSON serialization compiler function
 * Generates JIT code to serialize values to BSON format
 */
export function _compileToBSON(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.toBSON.id): jitCode {
    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.null:
            return `utl.writeBSONNull()`;

        case ReflectionKind.boolean:
            return `utl.writeBSONBoolean(${comp.vλl})`;

        case ReflectionKind.number:
            return generateNumberSerialization(comp.vλl);

        case ReflectionKind.string:
            return `utl.writeBSONString(${comp.vλl})`;

        case ReflectionKind.bigint:
            return `utl.writeBSONInt64(${comp.vλl})`;

        case ReflectionKind.literal: {
            // Literal types are serialized as their underlying value
            const literalValue = src.literal;
            if (typeof literalValue === 'string') {
                return `utl.writeBSONString(${JSON.stringify(literalValue)})`;
            } else if (typeof literalValue === 'number') {
                return generateNumberSerialization(JSON.stringify(literalValue));
            } else if (typeof literalValue === 'boolean') {
                return `utl.writeBSONBoolean(${literalValue})`;
            } else if (literalValue === null) {
                return `utl.writeBSONNull()`;
            }
            return `utl.writeBSONString(${JSON.stringify(String(literalValue))})`;
        }

        // ###################### COLLECTION TYPES ######################
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return `utl.writeBSONArray([])`;

            const bsonItems = `bsonItems${comp.getNestLevel(rt)}`;
            const resultVal = `bsonRes${comp.getNestLevel(rt)}`;
            const index = rt.getChildVarName(comp);

            return `
                const ${bsonItems} = [];
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${resultVal} = ${memberCode};
                    ${bsonItems}.push(${resultVal});
                }
                return utl.writeBSONArray(${bsonItems});
            `;
        }

        case ReflectionKind.object:
        case ReflectionKind.objectLiteral:
            return compileObjectSerialization(runType, comp, fnID);

        case ReflectionKind.class:
            return compileClassSerialization(runType as ClassRunType, comp, fnID);

        case ReflectionKind.union:
            return compileUnionSerialization(runType as UnionRunType, comp, fnID);

        // ###################### MEMBER TYPES ######################
        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const child = rt.getJitChild(comp);
            const propCode = child?.compile(comp, fnID);
            if (!child || !propCode) return undefined;

            const propName = rt.getPropertyName();
            const propType = getBSONTypeForRunType(child);

            if (rt.src.optional) {
                rt.tempChildVλl = comp.getChildVλl();
                return `(${rt.tempChildVλl} === undefined ? null : {name: ${JSON.stringify(propName)}, type: ${propType}, data: ${propCode}})`;
            }
            return `{name: ${JSON.stringify(propName)}, type: ${propType}, data: ${propCode}}`;
        }

        // ###################### NATIVE TYPES ######################
        case ReflectionKind.map: {
            const rt = runType as MapRunType;
            return compileMapSerialization(rt, comp, fnID);
        }

        case ReflectionKind.set: {
            const rt = runType as SetRunType;
            return compileSetSerialization(rt, comp, fnID);
        }

        case ReflectionKind.date:
            // Serialize Date as BSON DateTime (milliseconds since epoch)
            return `utl.writeBSONInt64(${comp.vλl}.getTime())`;

        // ###################### UNSUPPORTED TYPES ######################
        case ReflectionKind.promise:
        case ReflectionKind.function:
            throw new Error(`BSON serialization not supported for ${ReflectionKind[kind]} types`);

        default:
            // Fallback to string representation for unknown types
            return `utl.writeBSONString(String(${comp.vλl}))`;
    }
}

/**
 * Generate number serialization code with type detection
 */
function generateNumberSerialization(valueExpr: string): jitCode {
    return `
        (function() {
            const val = ${valueExpr};
            if (Number.isInteger(val) && val >= -2147483648 && val <= 2147483647) {
                return utl.writeBSONInt32(val);
            } else if (Number.isInteger(val)) {
                return utl.writeBSONInt64(val);
            } else {
                return utl.writeBSONDouble(val);
            }
        })()
    `;
}

/**
 * Compile object serialization
 */
function compileObjectSerialization(runType: BaseRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    if (runType.src.kind === ReflectionKind.class) {
        return compileClassSerialization(runType as ClassRunType, comp, fnID);
    }

    // Handle interface/object types
    const rt = runType as InterfaceRunType;
    const children = rt.getJitChildren(comp);

    if (children.length === 0) {
        return `utl.writeBSONDocument([])`;
    }

    const fieldsArray = `bsonFields${comp.getNestLevel(rt)}`;
    const childrenCode = children
        .map((prop) => {
            const propCode = prop.compile(comp, fnID);
            return propCode ? `const field = ${propCode}; if (field) ${fieldsArray}.push(field);` : '';
        })
        .filter(Boolean)
        .join('\n');

    return `
        (function() {
            const ${fieldsArray} = [];
            ${childrenCode}
            return utl.writeBSONDocument(${fieldsArray});
        })()
    `;
}

/**
 * Compile class serialization
 */
function compileClassSerialization(runType: ClassRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return `utl.writeBSONInt64(${comp.vλl}.getTime())`;

        case ReflectionSubKind.map:
            return compileMapSerialization(runType as any, comp, fnID);

        case ReflectionSubKind.set:
            return compileSetSerialization(runType as any, comp, fnID);

        default: {
            // Regular class serialization with className metadata
            const children = runType.getJitChildren(comp);
            const fieldsArray = `bsonFields${comp.getNestLevel(runType)}`;
            const className = runType.getClassName();

            const childrenCode = children
                .map((prop) => {
                    const propCode = prop.compile(comp, fnID);
                    return propCode ? `const field = ${propCode}; if (field) ${fieldsArray}.push(field);` : '';
                })
                .filter(Boolean)
                .join('\n');

            return `
                (function() {
                    const ${fieldsArray} = [
                        {name: "__className", type: 0x02, data: utl.writeBSONString(${JSON.stringify(className)})}
                    ];
                    ${childrenCode}
                    return utl.writeBSONDocument(${fieldsArray});
                })()
            `;
        }
    }
}

/**
 * Compile Map serialization
 */
function compileMapSerialization(runType: MapRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const keyChild = runType.getJitChildren(comp)[0];
    const valueChild = runType.getJitChildren(comp)[1];

    const keyCode = keyChild?.compile(comp, fnID) || 'utl.writeBSONString(String(k))';
    const valueCode = valueChild?.compile(comp, fnID) || 'utl.writeBSONString(String(v))';

    const mapItems = `mapItems${comp.getNestLevel(runType)}`;

    return `
        (function() {
            const ${mapItems} = [];
            for (const [k, v] of ${comp.vλl}) {
                ${mapItems}.push(utl.writeBSONDocument([
                    {name: "k", type: ${getBSONTypeForRunType(keyChild)}, data: ${keyCode}},
                    {name: "v", type: ${getBSONTypeForRunType(valueChild)}, data: ${valueCode}}
                ]));
            }
            return utl.writeBSONArray(${mapItems});
        })()
    `;
}

/**
 * Compile Set serialization
 */
function compileSetSerialization(runType: SetRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const itemChild = runType.getJitChildren(comp)[0];
    const itemCode = itemChild?.compile(comp, fnID) || 'utl.writeBSONString(String(item))';

    const setItems = `setItems${comp.getNestLevel(runType)}`;

    return `
        (function() {
            const ${setItems} = [];
            for (const item of ${comp.vλl}) {
                ${setItems}.push(${itemCode});
            }
            return utl.writeBSONArray(${setItems});
        })()
    `;
}

/**
 * Compile Union serialization
 */
function compileUnionSerialization(runType: UnionRunType, comp: JitCompiler, fnID: JitFnID): jitCode {
    const variants = runType.getVariants();

    // Generate type checks for each variant
    const variantChecks = variants
        .map((variant) => {
            const typeCheck = generateTypeCheck(variant, comp.vλl);
            const serializationCode = variant.compile(comp, fnID);
            return `if (${typeCheck}) { return ${serializationCode}; }`;
        })
        .join('\n');

    return `
        (function() {
            ${variantChecks}
            throw new Error('Value does not match any union variant');
        })()
    `;
}

/**
 * Generate type check for union variants
 */
function generateTypeCheck(runType: BaseRunType, valueExpr: string): string {
    const kind = runType.src.kind;

    switch (kind) {
        case ReflectionKind.null:
            return `${valueExpr} === null`;
        case ReflectionKind.boolean:
            return `typeof ${valueExpr} === 'boolean'`;
        case ReflectionKind.number:
            return `typeof ${valueExpr} === 'number'`;
        case ReflectionKind.string:
            return `typeof ${valueExpr} === 'string'`;
        case ReflectionKind.array:
            return `Array.isArray(${valueExpr})`;
        case ReflectionKind.object:
            return `typeof ${valueExpr} === 'object' && ${valueExpr} !== null && !Array.isArray(${valueExpr})`;
        default:
            return `true`; // Fallback
    }
}

/**
 * Get BSON type code for a RunType
 */
function getBSONTypeForRunType(runType?: BaseRunType): number {
    if (!runType) return 0x02; // Default to string

    const kind = runType.src.kind;
    switch (kind) {
        case ReflectionKind.null:
            return 0x0a;
        case ReflectionKind.boolean:
            return 0x08;
        case ReflectionKind.number:
            return 0x01; // Default to double, will be determined at runtime
        case ReflectionKind.string:
            return 0x02;
        case ReflectionKind.array:
            return 0x04;
        case ReflectionKind.object:
        case ReflectionKind.class:
            return 0x03;
        case ReflectionKind.bigint:
            return 0x12;
        default:
            return 0x02; // Default to string
    }
}
