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
import type {LiteralRunType} from '../../runType/atomic/literal';
import {jitBinaryDeserializerArgs, JitFunctions} from '../../constants.functions';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import {childIsExpression, isSafePropName, toLiteral} from '../../lib/utils';

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
        case ReflectionKind.any: {
            // any is deserialized from json string
            return `JSON.parse(${dεs}.desString())`;
        }
        case ReflectionKind.null:
            return `(${dεs}.index++, null)`;
        case ReflectionKind.boolean:
            return `${dεs}.uint32[${dεs}.index++] === 1`;
        case ReflectionKind.number: {
            return `${dεs}.desNumber()`;
        }
        case ReflectionKind.string: {
            return `${dεs}.desString()`;
        }
        case ReflectionKind.bigint: {
            return `BigInt(${dεs}.desString())`;
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return `(${dεs}.index++, undefined)`;
        case ReflectionKind.symbol: {
            return `Symbol(${dεs}.desString() || undefined)`;
        }
        case ReflectionKind.regexp: {
            return `new RegExp(${dεs}.desString(), ${dεs}.desString())`;
        }
        case ReflectionKind.object:
            // similar to any, this is deserialized as json string
            return `JSON.parse(${dεs}.desString())`;
        case ReflectionKind.enum: {
            return `${dεs}.desEnum()`;
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary deserialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary deserialization');
        case ReflectionKind.literal:
            return toLiteral((runType as LiteralRunType).src.literal);
        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            rt.checkNonSkipTypes(comp);
            const child = rt.getMemberType()!;
            const childCode = child.compile(comp, fnID);
            if (!childCode) throw new Error(`Do not know how to deserialize Array<${child.getTypeName()}> from Binary.`);
            const index = rt.getChildVarName(comp);
            const isExpression = childIsExpression(JitFunctions.fromBinary.id, child);
            const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
            // deserialized from [length, items...]
            const lengthVal = `arrL${comp.getNestLevel(rt)}`;
            return `
                const ${lengthVal} = ${dεs}.uint32[${dεs}.index++];
                ${comp.vλl} = new Array(${lengthVal});
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${lengthVal}; ${index}++) {${code}}
            `;
        }

        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberCode = rt.getJitChild(comp)?.compile(comp, fnID);
            if (!memberCode) return undefined;

            const prop = rt.getChildVarName(comp);
            const countVar = `cnt${comp.getNestLevel(rt)}`;
            const indexVar = `prI${comp.getNestLevel(rt)}`;

            // Deserialize key based on index type
            let keyDeserializationCode: string;
            if (indexKind === ReflectionKind.number) {
                // For number indices, deserialize as uint32
                keyDeserializationCode = `const ${prop} = ${dεs}.uint32[${dεs}.index++];`;
            } else {
                // For string indices (default), deserialize as string
                keyDeserializationCode = `const ${prop} = ${dεs}.desString();`;
            }

            const deserializeCode = `for (let ${indexVar} = 0; ${indexVar} < ${countVar}; ${indexVar}++) {${keyDeserializationCode} ${comp.vλl}[${prop}] = ${memberCode};}`;

            return `const ${countVar} = ${dεs}.uint32[${dεs}.index++]; ${comp.vλl} = {}; ${deserializeCode}`;
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

            const child = rt.getJitChild(comp)!;
            const memberCode = child?.compile(comp, fnID);
            // TODO, not sure what to do is memberCode is an not an expression, as we need to assign to a variable
            const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
            if (!isExpression) throw new Error('Only expression can be used as property value');
            if (rt.isOptional()) {
                const {bitMIndexVar, bitIndex} = getOptionalPropsItems(parent, comp, 0, rt.optionalIndex);
                return `if (${dεs}.uint32[${bitMIndexVar}] & (1 << (${bitIndex}))) {${comp.getChildVλl()} = ${memberCode}}`;
            }

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

                const {required, optional, indexSignatures} = rt.splitJitSplitChildren(comp);
                if (indexSignatures.length) {
                    return indexSignatures[0].compile(comp, fnID) as string; // index signature code already contains the loop
                }

                // non optional properties are restored as: '{a: deserializeA, b: deserializeB, c: deserializeC};
                // and must be serialized/deserialised in the same order they are declared in the type
                // no index var or anything required as properties are deserialized in the order they are declared
                const nonOptionalCode = required
                    .map((prop) => prop.compile(comp, fnID))
                    .filter(Boolean)
                    .join(',');
                const objectCode = `${comp.vλl} = {${nonOptionalCode}};`;

                // optional props are initialized as obj.a = deserializeA; obj.b = deserializeB; obj.c = deserializeC;
                // bitmap is used to determine which optional props are present
                // header format: [bitmap length, bitmap, [prop values]]

                let optionalPropsCode = '';
                if (optional.length) {
                    // optional properties are restored using a loop
                    const {variablesInit, bitMIndexVar} = getOptionalPropsItems(rt, comp, optional.length);
                    const propsCode = optional
                        .map((prop, i) => {
                            prop.optionalIndex = i;
                            const modIndex = i + 1;
                            const shouldIncreaseBufferIndex = modIndex % 32 === 0;
                            if (!shouldIncreaseBufferIndex) return prop.compile(comp, fnID);
                            // every 32 props we need to increase the bitmap index
                            return `${prop.compile(comp, fnID)} ${bitMIndexVar}++; `;
                        })
                        .filter(Boolean)
                        .join('');

                    optionalPropsCode = `${variablesInit}\n${propsCode}`;
                }

                return `${objectCode}\n${optionalPropsCode}`;
            }

        case ReflectionKind.class:
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return `new Date(${dεs}.desFloat64())`;
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

function getOptionalPropsItems(rt: InterfaceRunType, comp: BinaryCompiler, optionalPropsLength = 0, currentPropIndex = 0) {
    const dεs = comp.args.dεs;
    const nestLevel = comp.getNestLevel(rt);
    const bitMIndexVar = `bimI${nestLevel}`; // index of the optional prop loop
    const bitmapLength = `(${optionalPropsLength} + 31) >> 5`; // equivalent to Math.ceil(optionalPropsLength / 32)
    const bitIndex = `${currentPropIndex} & 31`; // equivalent to index % 32
    // bitmap for present optional props
    const variablesInit = `let ${bitMIndexVar} = ${dεs}.index; ${dεs}.index += ${bitmapLength};`;
    return {bitMIndexVar, bitmapLength, bitIndex, variablesInit};
}
