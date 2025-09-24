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
import {jitBinaryDeserializerArgs, JitFunctions} from '../../constants.functions';
import {mionBinDesEnum, mionBinDesNumber, mionBinDesString} from './binaryPureFns';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import {isSafePropName} from '../../lib/utils';

type BinaryCompiler = BaseCompiler<typeof jitBinaryDeserializerArgs, typeof JitFunctions.fromBinary.id>;

/**
 * Main Binary deserialization compiler function
 * Generates JIT code to deserialize Binary data to JavaScript values
 */
export function _compileFromBinary(runType: BaseRunType, comp: BinaryCompiler): jitCode {
    const src = runType.src;
    const kind = src.kind;
    const dεs = comp.args.dεs;
    const fnID = comp.fnID;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any:
            throw new Error('Binary deserialization not supported for unknown/any types');
        case ReflectionKind.null:
            return `(${dεs}.index++, null)`;
        case ReflectionKind.boolean:
            return `${dεs}.uint32Array[${dεs}.index++] === 1`;
        case ReflectionKind.number: {
            const deserializeNumberFn = compileAddPureFunctionWithClosure(comp, mionBinDesNumber);
            return `${deserializeNumberFn}(${dεs})`;
        }
        case ReflectionKind.string: {
            const deserializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinDesString);
            return `${deserializeStringFn}(${dεs})`;
        }
        case ReflectionKind.bigint: {
            const deserializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinDesString);
            return `BigInt(${deserializeStringFn}(${dεs}))`;
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return `(${dεs}.index++, undefined)`;
        case ReflectionKind.symbol: {
            const deserializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinDesString);
            return `Symbol(${deserializeStringFn}(${dεs}) || undefined)`;
        }
        case ReflectionKind.regexp: {
            const deserializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinDesString);
            return `new RegExp(${deserializeStringFn}(${dεs}), ${deserializeStringFn}(${dεs}))`;
        }
        case ReflectionKind.object:
            throw new Error('Binary deserialization not supported for generic object types');

        case ReflectionKind.enum: {
            const deserializeEnumFn = compileAddPureFunctionWithClosure(comp, mionBinDesEnum);
            return `${deserializeEnumFn}(${dεs})`;
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary deserialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary deserialization');
        case ReflectionKind.literal:
            return compileLiteral(runType as LiteralRunType, comp);

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            const totalVar = `lng${comp.getNestLevel(rt)}`;
            const index = rt.getChildVarName(comp);
            const arrayCode = `for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${totalVar}; ${index}++) {${comp.vλl}[${index}] = ${memberCode}}`;
            return `const ${totalVar} = ${dεs}.uint32Array[${dεs}.index++];${comp.vλl} = new Array(${totalVar});${arrayCode}`;
        }

        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return undefined;

            const prop = rt.getChildVarName(comp);
            const countVar = `cnt${comp.getNestLevel(rt)}`;
            const indexVar = `prI${comp.getNestLevel(rt)}`;
            const deserializeStringFn = compileAddPureFunctionWithClosure(comp, mionBinDesString);

            // Deserialize key based on index type
            let keyDeserializationCode: string;
            if (indexKind === ReflectionKind.number) {
                // For number indices, deserialize as uint32
                keyDeserializationCode = `const ${prop} = ${dεs}.uint32Array[${dεs}.index++];`;
            } else {
                // For string indices (default), deserialize as string
                keyDeserializationCode = `const ${prop} = ${deserializeStringFn}(${dεs});`;
            }

            const deserializeCode = `for (let ${indexVar} = 0; ${indexVar} < ${countVar}; ${indexVar}++) {${keyDeserializationCode} ${comp.vλl}[${prop}] = ${memberCode};}`;

            return `const ${countVar} = ${dεs}.uint32Array[${dεs}.index++]; ${comp.vλl} = {}; ${deserializeCode}`;
        }

        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                // TODO: Handle function parameters
                break;
            } else {
                throw new Error(
                    'Binary deserialization not supported for function types, call compileParams or compileReturn instead'
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
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const parent = rt.getParent() as InterfaceRunType;
            if (parent.hasIndexSignature(comp)) return undefined; // all deserialization is done by index signature code

            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            // optional props go inside a switch statement and should produce each case block with a break;
            if (rt.isOptional())
                return `case ${rt.getJitChildIndex(comp)}: ${comp.vλl}${getPropName(rt, comp, false)} = ${memberCode}; break`;

            // non optional props are part of an object constructor {a: deserializeA, b: deserializeB, c: deserializeC}
            // non optional props does not include the prop index as it is known at compile time
            const propName = getPropName(rt, comp, true);
            return `${propName}:${memberCode}`;
        }
        case ReflectionKind.rest:
            // TODO
            break;

        case ReflectionKind.tupleMember:
            // TODO
            break;

        case ReflectionKind.promise:
            throw new Error('Binary deserialization not supported for Promise types');

        // ###################### COLLECTION RUNTYPES ######################
        // Types that contain other types as members
        case ReflectionKind.objectLiteral:
        case ReflectionKind.intersection:
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error('Binary deserialization is disabled for Non Serializable types');
            } else {
                const rt = runType as InterfaceRunType;

                const {nonOptionalChildren, optionalChildren, propsLengthVar} = getCompileObjectItems(rt, comp);
                const indexSignatureProp = optionalChildren.find((prop) => prop.src.kind === ReflectionKind.indexSignature);
                if (indexSignatureProp) {
                    return indexSignatureProp.compile(comp, fnID) as string; // index signature code already contains the loop
                }

                // non optional properties are restored as: '{a: deserializeA, b: deserializeB, c: deserializeC};
                // and must be serialized/deserialised in the same order they are declared in the type
                const nonOptionalCode = nonOptionalChildren
                    .map((prop) => prop.compile(comp, fnID))
                    .filter(Boolean)
                    .join(',');
                const diffCode = nonOptionalChildren.length ? ` - ${nonOptionalChildren.length}` : '';
                const initVars = `const ${propsLengthVar} = ${dεs}.uint32Array[${dεs}.index++]${diffCode};`;
                const objectCode = `${comp.vλl} = {${nonOptionalCode}};`;

                let optionalPropsCode = '';
                if (optionalChildren.length && !indexSignatureProp) {
                    // optional properties are restored using a loop
                    const propsCases = optionalChildren
                        .map((prop) => prop.compile(comp, fnID))
                        .filter(Boolean)
                        .join(';\n');
                    const iName = `iP${comp.getNestLevel(rt)}`;
                    const propIndex = `propI${comp.getNestLevel(rt)}`;
                    optionalPropsCode = `for (let ${iName} = 0; ${iName} < ${propsLengthVar}; ${iName}++) {
                        const ${propIndex} = ${dεs}.uint32Array[${dεs}.index++];
                        switch(${propIndex}) {
                            ${propsCases}
                            default: throw new Error('Unknown property index' + ${propIndex} + ' cannot be deserialized in type ${rt.getTypeName()} at buffer position' + ${dεs}.index);
                        }
                    }`;
                }

                return `${initVars}\n${objectCode}\n${optionalPropsCode}`;
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
                    throw new Error('Binary deserialization disabled for Non Serializable types');
                default:
                    // TODO: Handle regular class
                    break;
            }
            break;

        case ReflectionKind.infer:
            throw new Error('Infer is not supported in Binary deserialization');

        case ReflectionKind.tuple:
            // TODO
            break;

        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in Binary deserialization');

        case ReflectionKind.union:
            // TODO
            break;

        default:
            throw new Error(`Binary deserialization not supported for ${ReflectionKind[kind]} types`);
    }
}

function getPropName(rt: PropertyRunType, comp: BinaryCompiler, isObjectConstructor: boolean): string | number {
    const isSafe = isSafePropName(rt.src.name);
    if (isObjectConstructor) return isSafe ? rt.getChildVarName(comp) : rt.getChildLiteral(comp);
    return isSafe ? `.${rt.getChildVarName(comp)}` : `[${rt.getChildLiteral(comp)}]`;
}

function getCompileObjectItems(rt: InterfaceRunType, comp: BinaryCompiler) {
    // we need to use getJitNonOptionalChildrenFirst to ensure serialization order is the same as deserialization
    const nonOptionalFirst = rt.getJitNonOptionalChildrenFirst(comp);
    const nonOptionalChildren = nonOptionalFirst.filter((prop) => !prop.isOptional());
    const optionalChildren = nonOptionalFirst.filter((prop) => prop.isOptional());

    const propsLengthVar = `pL${comp.getNestLevel(rt)}`;
    return {nonOptionalChildren, optionalChildren, propsLengthVar};
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
    const result = _compileFromBinary(runType, comp);
    // Restore the original kind
    (src as any).kind = originalKind;
    return result;
}
