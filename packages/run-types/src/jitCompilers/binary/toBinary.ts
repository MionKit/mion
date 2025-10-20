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
import {type BaseCompiler} from '../../lib/jitCompiler';
import {jitBinarySerializerArgs, JitFunctions} from '../../constants.functions';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import {addFullStop} from '../../lib/utils';

type BinaryCompiler = BaseCompiler<typeof jitBinarySerializerArgs, typeof JitFunctions.toBinary.id>;
const fnID = JitFunctions.toBinary.id;

/**
 * Main Binary serialization compiler function
 * Generates JIT code to serialize values to Binary format following Binary 1.1 specification
 *
 * This function generates JavaScript expressions that return Uint8Array containing Binary bytes.
 */
export function _compileToBinary(runType: BaseRunType, comp: BinaryCompiler): JitCode {
    const src = runType.src;
    const kind = src.kind;
    const sεr = comp.args.sεr;

    // hack is used in some case to increase the index passing an extra argument to view.set methods
    // ie: view.setUint32(index, value, littleEndian, index += 4);
    // setUint32 only accepts 3 arguments, but we use the 4rd one to increase the index on a single statement so code can be used as an expression

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any: {
            // any is serialized as json string
            return {code: `${sεr}.serString(JSON.stringify(${comp.vλl}))`, type: 'S'};
        }
        case ReflectionKind.null:
            return {code: `${sεr}.view.setUint8(${sεr}.index++, 0)`, type: 'S'};
        case ReflectionKind.boolean:
            return {code: `${sεr}.view.setUint8(${sεr}.index++, !!${comp.vλl})`, type: 'S'};
        case ReflectionKind.number: {
            return {code: `${sεr}.view.setFloat64(${sεr}.index,${comp.vλl}, 1, (${sεr}.index += 8))`, type: 'S'};
        }
        case ReflectionKind.string: {
            return {code: `${sεr}.serString(${comp.vλl})`, type: 'S'};
        }
        case ReflectionKind.bigint: {
            return {code: `${sεr}.serString(${comp.vλl}.toString())`, type: 'S'};
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return {code: `${sεr}.view.setUint8(${sεr}.index++, 1)`, type: 'S'};
        case ReflectionKind.symbol: {
            return {code: `${sεr}.serString(${comp.vλl}.description || '')`, type: 'S'};
        }
        case ReflectionKind.regexp: {
            return {code: `${sεr}.serString(${comp.vλl}.source);${sεr}.serString(${comp.vλl}.flags)`, type: 'S'};
        }
        case ReflectionKind.object:
            // similar to any, this is serialized as json string
            return {code: `${sεr}.serString(JSON.stringify(${comp.vλl}))`, type: 'S'};
        case ReflectionKind.enum: {
            return {code: `${sεr}.serEnum(${comp.vλl})`, type: 'S'};
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary serialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be serialized to Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary serialization');
        case ReflectionKind.literal:
            return {code: '', type: 'S'}; // literals can be skipped as we restore the value directly from runType in jit code

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            rt.checkNonSkipTypes(comp);
            const child = rt.getMemberType()!;
            const memberCode = child.compile(comp, fnID, 'S');
            if (!memberCode?.code) throw new Error(`Do not know how to serialize Array<${child.getTypeName()}> to Binary.`);
            const index = rt.getChildVarName(comp);
            // serialized as [length, items...]
            return {
                code: `
                ${sεr}.view.setUint32(${sεr}.index, ${comp.vλl}.length, 1); ${sεr}.index += 4;
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode.code}}
            `,
                type: 'S',
            };
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const parent = rt.getParent() as InterfaceRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID, 'S');
            if (!memberCode?.code) return {code: undefined, type: 'S'};

            const propVar = rt.getChildVarName(comp);
            const {bitMIndexVar} = getOptionalPropsItems(parent, comp);

            // Serialize entries
            let keySerializationCode: string;
            if (indexKind === ReflectionKind.number) {
                keySerializationCode = `${sεr}.view.setUint32(${sεr}.index , Number(${propVar}), 1); ${sεr}.index += 4;`;
            } else {
                keySerializationCode = `${sεr}.serString(${propVar});`;
            }

            return {
                code: `for (const ${propVar} in ${comp.vλl}) {${keySerializationCode} ${memberCode.code}; ${bitMIndexVar}++;}`,
                type: 'S',
            };
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
            if (parent.hasIndexSignature(comp)) return {code: undefined, type: 'S'}; // all serialization is done by index signature code

            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID, 'S').code || '';
            if (rt.isOptional()) {
                const {bitMIndexVar, bitIndex} = getOptionalPropsItems(parent, comp, 0, rt.optionalIndex);
                const setBitMask = `${sεr}.setBitMask(${bitMIndexVar}, ${bitIndex})`;
                return {code: `if (${comp.getChildVλl()} !== undefined) {${addFullStop(memberCode)} ${setBitMask}}`, type: 'S'};
            }
            // non optional properties rely in the order they are defined in the type so no need to include the index
            return {code: `${memberCode}`, type: 'S'};
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

                const requiredProps = required.map((prop) => prop.compile(comp, fnID, 'S').code);
                const requiredPropsCode = requiredProps.join(';');

                let optionalPropsCode = '';
                if (optional.length) {
                    const {bitMapInit, bitMIndexVar} = getOptionalPropsItems(rt, comp, optional.length);
                    const propsCode = optional
                        .map((prop, i) => {
                            prop.optionalIndex = i;
                            const modIndex = i + 1;
                            const shouldIncreaseBufferIndex = modIndex % 8 === 0;
                            const propCode = prop.compile(comp, fnID, 'S').code;
                            if (!shouldIncreaseBufferIndex) return propCode;
                            // every 8 props we need to increase the bitmap index
                            return `${propCode} ${bitMIndexVar}++;`;
                        })
                        .filter(Boolean)
                        .join('');
                    optionalPropsCode = `${bitMapInit}\n${propsCode}`;
                }

                return {code: `${requiredPropsCode}\n${optionalPropsCode}`, type: 'S'};
            }
        }
        case ReflectionKind.class:
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return {
                        code: `${sεr}.view.setFloat64(${sεr}.index, ${comp.vλl}.getTime(), 1, (${sεr}.index += 8))`,
                        type: 'S',
                    };
                case ReflectionSubKind.map:
                    // TODO: Handle Map class
                    break;
                case ReflectionSubKind.set:
                    // TODO: Handle Set class
                    break;
                case ReflectionSubKind.nonSerializable:
                    throw new Error('Binary serialization disabled for Non Serializable types');
                default: {
                    const rt = runType as InterfaceRunType;
                    if (rt.isCallable()) {
                        const callSignature = rt.getCallSignature();
                        if (callSignature) return callSignature.compile(comp, fnID, 'S');
                    }
                    const originalKind = runType.src.kind;
                    (runType.src as any).kind = ReflectionKind.objectLiteral;
                    const result = _compileToBinary(runType, comp);
                    (runType.src as any).kind = originalKind;
                    return result;
                }
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

    // Default return for cases that break without returning
    return {code: undefined, type: 'S'};
}

// there is a bitmask used to determine which optional props are present
// the bitmask length increments by 1 byte for every 8 optional props
function getOptionalPropsItems(rt: InterfaceRunType, comp: BinaryCompiler, optionalPropsLength = 0, currentPropIndex = 0) {
    const sεr = comp.args.sεr;
    const nestLevel = comp.getNestLevel(rt);
    const bitMIndexVar = `bmI${nestLevel}`; // index of the optional prop loop
    const bitmapLength = Math.ceil(optionalPropsLength / 8);
    const bitIndex = `${currentPropIndex} & 7`; // equivalent to index % 8
    // initialize bitmap to zero as there could be values left from previous serialization
    const indexVar = `iBl${nestLevel}`;
    const setBitmapToZero =
        bitmapLength > 1
            ? `for (let ${indexVar} = 0; ${indexVar} < ${bitmapLength}; ${indexVar}++) {${sεr}.view.setUint8(${sεr}.index++, 0)}`
            : `${sεr}.view.setUint8(${sεr}.index++, 0)`;
    const bitMapInit = `${bitmapLength > 1 ? 'let ' : 'const'} ${bitMIndexVar} = ${sεr}.index; ${setBitmapToZero}`;
    return {bitMIndexVar, bitmapLength, bitIndex, bitMapInit};
}
