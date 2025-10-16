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
import {type BaseCompiler} from '../../lib/jitCompiler';
import {jitBinarySerializerArgs, JitFunctions} from '../../constants.functions';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';

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
    const fnID = comp.fnID;

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any: {
            // any is serialized as json string
            return `${sεr}.serString(JSON.stringify(${comp.vλl}))`;
        }
        case ReflectionKind.null:
            return `${sεr}.uint32[${sεr}.index++] = 0`;
        case ReflectionKind.boolean:
            return `${sεr}.uint32[${sεr}.index++] = (${comp.vλl}) ? 1 : 0`;
        case ReflectionKind.number: {
            return `${sεr}.serNumber(${comp.vλl})`;
        }
        case ReflectionKind.string: {
            return `${sεr}.serString(${comp.vλl})`;
        }
        case ReflectionKind.bigint: {
            return `${sεr}.serString(${comp.vλl}.toString())`;
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return `${sεr}.uint32[${sεr}.index++] = -1`;
        case ReflectionKind.symbol: {
            return `${sεr}.serString(${comp.vλl}.description || '')`;
        }
        case ReflectionKind.regexp: {
            return `${sεr}.serString(${comp.vλl}.source);${sεr}.serString(${comp.vλl}.flags)`;
        }
        case ReflectionKind.object:
            // similar to any, this is serialized as json string
            return `${sεr}.serString(JSON.stringify(${comp.vλl}))`;
        case ReflectionKind.enum: {
            return `${sεr}.serEnum(${comp.vλl})`;
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary serialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be serialized to Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary serialization');
        case ReflectionKind.literal:
            return ''; // literals can be skipped as we restore the value directly from runType in jit code

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            rt.checkNonSkipTypes(comp);
            const child = rt.getMemberType()!;
            const memberCode = child.compile(comp, fnID);
            if (!memberCode) throw new Error(`Do not know how to serialize Array<${child.getTypeName()}> to Binary.`);
            const index = rt.getChildVarName(comp);
            // serialized as [length, items...]
            return `
                ${sεr}.uint32[${sεr}.index++] = ${comp.vλl}.length;
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    ${memberCode}
                }
            `;
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const parent = rt.getParent() as InterfaceRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return undefined;

            const propVar = rt.getChildVarName(comp);
            const {bitMIndexVar} = getOptionalPropsItems(parent, comp);

            // Serialize entries
            let keySerializationCode: string;
            if (indexKind === ReflectionKind.number) {
                keySerializationCode = `${sεr}.uint32[${sεr}.index++] = Number(${propVar})`;
            } else {
                keySerializationCode = `${sεr}.serString(${propVar})`;
            }

            return `for (const ${propVar} in ${comp.vλl}) {${keySerializationCode} ${memberCode};  ${bitMIndexVar}++;}`;
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
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const parent = rt.getParent() as InterfaceRunType;
            if (parent.hasIndexSignature(comp)) return undefined; // all serialization is done by index signature code

            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return undefined;
            if (rt.isOptional()) {
                const {bitMIndexVar, bitIndex} = getOptionalPropsItems(parent, comp, 0, rt.optionalIndex);
                return `if (${comp.getChildVλl()} !== undefined) {${memberCode}; ${sεr}.uint32[${bitMIndexVar}] |= 1 << (${bitIndex})}`;
            }
            // non optional properties rely in the order they are defined in the type so no need to include the index
            return `${memberCode};`;
        }
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
        case ReflectionKind.intersection: {
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error('Binary serialization is disabled for Non Serializable types');
            } else {
                const rt = runType as InterfaceRunType;
                // we need to ensure non optional properties are serialized first so then we can restore the object correctly
                // non optional properties are restored as: '{a: deserializeA, b: deserializeB, c: deserializeC};
                // and must be serialized/deserialized in the same order they are declared in the type
                const {required, optional} = rt.splitJitSplitChildren(comp);

                const requiredPropsCode = required
                    .map((prop) => prop.compile(comp, fnID))
                    .filter(Boolean)
                    .join(';');

                let optionalPropsCode = '';
                if (optional.length) {
                    const {variablesInit, bitMIndexVar} = getOptionalPropsItems(rt, comp, optional.length);
                    const propsCode = optional
                        .map((prop, i) => {
                            prop.optionalIndex = i;
                            const modIndex = i + 1;
                            const shouldIncreaseBufferIndex = modIndex % 32 === 0;
                            if (!shouldIncreaseBufferIndex) return prop.compile(comp, fnID);
                            // every 32 props we need to increase the bitmap index
                            return `${prop.compile(comp, fnID)} ${bitMIndexVar}++;`;
                        })
                        .filter(Boolean)
                        .join('');
                    optionalPropsCode = `${variablesInit}\n${propsCode}`;
                }

                return `${requiredPropsCode}\n${optionalPropsCode}`;
            }
        }
        case ReflectionKind.class:
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return `${sεr}.serFloat64(${comp.vλl}.getTime())`;
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

function getOptionalPropsItems(rt: InterfaceRunType, comp: BinaryCompiler, optionalPropsLength = 0, currentPropIndex = 0) {
    const sεr = comp.args.sεr;
    const nestLevel = comp.getNestLevel(rt);
    const bitMIndexVar = `bimI${nestLevel}`; // index of the optional prop loop
    const bitmapLength = Math.ceil(optionalPropsLength / 32);
    const bitIndex = `${currentPropIndex} & 31`; // equivalent to index % 32
    // initialize bitmap to zero as there could be values left from previous serialization
    const setBitmapToZero = Array.from({length: bitmapLength})
        .map(() => `${sεr}.uint32[${sεr}.index++] = 0`)
        .join(';');
    const variablesInit = `let ${bitMIndexVar} = ${sεr}.index; ${setBitmapToZero}`;
    return {bitMIndexVar, bitmapLength, bitIndex, variablesInit};
}
