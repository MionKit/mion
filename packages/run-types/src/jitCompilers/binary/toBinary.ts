/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind';
import {jitBinarySerializerArgs, JitFunctions} from '../../constants.functions';
import {createIfElseFn} from '../../lib/utils';
import {MAX_UNION_ITEMS} from '../../constants';
import type {JitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import type {BaseFnCompiler} from '../../lib/jitFnCompiler';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import type {ParameterRunType} from '../../runType/member/param';
import type {TupleRunType} from '../../runType/collection/tuple';
import type {UnionRunType} from '../../runType/collection/union';
import type {IterableRunType} from '../../runType/native/Iterable';

type BinaryCompiler = BaseFnCompiler<typeof jitBinarySerializerArgs, typeof JitFunctions.toBinary.id>;
const fnID = JitFunctions.toBinary.id;

/**
 * Main Binary serialization compiler function
 * Generates JIT code to serialize values to Binary format following Binary 1.1 specification
 *
 * This function generates JavaScript expressions that return Uint8Array containing Binary bytes.
 */
export function emitToBinary(runType: BaseRunType, comp: BinaryCompiler): JitCode {
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
        case ReflectionKind.rest: // rest params are serialized as array but start at rest item index
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType;
            rt.checkNonSkipTypes(comp);
            const child = rt.getMemberType()!;
            const memberJit = comp.compile(child, 'S', fnID);
            if (!memberJit?.code) throw new Error(`Do not know how to serialize Array<${child.getTypeName()}> to Binary.`);
            const index = rt.getChildVarName(comp);
            // serialized as [length, items...]
            return {
                code: `
                ${sεr}.view.setUint32(${sεr}.index, ${comp.vλl}.length, 1); ${sεr}.index += 4;
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberJit.code}}
            `,
                type: 'S',
            };
        }
        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberJit = comp.compile(rt.getJitChild(comp), 'S', fnID);
            if (!memberJit?.code) return {code: undefined, type: 'S'};

            const propVar = rt.getChildVarName(comp);
            const lengthVar = `cnt${comp.getNestLevel(rt)}`;
            const indexVar = `piI${comp.getNestLevel(rt)}`;
            const varsInit = `let ${lengthVar} = 0; const ${indexVar} = ${sεr}.index; ${sεr}.index += 4;`;

            // Serialize entries
            let keySerializationCode: string;
            if (indexKind === ReflectionKind.number) {
                keySerializationCode = `${sεr}.view.setUint32(${sεr}.index , Number(${propVar}), 1); ${sεr}.index += 4;`;
            } else {
                keySerializationCode = `${sεr}.serString(${propVar});`;
            }

            return {
                code: `
                ${varsInit};
                for (const ${propVar} in ${comp.vλl}) {${keySerializationCode} ${memberJit.code}; ${lengthVar}++;}
                ${sεr}.view.setUint32(${indexVar}, ${lengthVar}, 1);
            `,
                type: 'S',
            };
        }

        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                return emitToBinaryAs(runType, comp, ReflectionKind.tuple);
            } else {
                throw new Error('Binary serialization not supported for functions, call compileParams or compileReturn instead.');
            }
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            switch (src.subKind) {
                case ReflectionSubKind.mapKey:
                case ReflectionSubKind.mapValue:
                case ReflectionSubKind.setItem: {
                    const child = rt.getJitChild(comp);
                    const childJit = comp.compile(child, 'S', fnID);
                    if (!childJit?.code) throw new Error(`Do not know how to serialize ${rt.getTypeName()} to Binary.`);
                    return childJit;
                }
                default: {
                    return emitToBinaryAs(runType, comp, ReflectionKind.tupleMember);
                }
            }
        }
        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const parent = rt.getParent() as InterfaceRunType;
            if (parent.hasIndexSignature(comp)) return {code: undefined, type: 'S'}; // all serialization is done by index signature code

            const memberCode = comp.compile(rt.getJitChild(comp), 'S', fnID).code || '';
            if (rt.isOptional()) {
                const {bitMIndexVar, bitIndex} = getOptionalPropsItems(parent, comp, 0, rt.optionalIndex);
                const setBitMask = `${sεr}.setBitMask(${bitMIndexVar}, ${bitIndex})`;
                return {code: `if (${comp.getChildVλl()} !== undefined) {${memberCode};${setBitMask}}`, type: 'S'};
            }
            // non optional properties rely in the order they are defined in the type so no need to include the index
            return {code: `${memberCode}`, type: 'S'};
        }
        case ReflectionKind.tupleMember: {
            const rt = runType as ParameterRunType;
            const child = rt.getJitChild(comp);
            const childJit = comp.compile(child, 'S', fnID);
            const nullJIt = emitToBinaryAs(rt, comp, ReflectionKind.undefined);
            const itemJit = childJit?.code ? childJit : nullJIt; // if child is not serializable, we serialize null as need to fill the space in the tuple
            if (rt.isRest()) return itemJit;
            if (rt.isOptional()) {
                // todo, we could optimize this by using bitmap mask to use a single bit per optional param (similar to what we do for properties)
                const isDefined = `${sεr}.view.setUint8(${sεr}.index++, 1)`;
                const notDefined = `${sεr}.view.setUint8(${sεr}.index++, 0)`;
                const code = `if (${comp.getChildVλl()} !== undefined){${isDefined};${itemJit.code}} else {${notDefined}}`;
                return {code, type: 'S'};
            }
            return itemJit;
        }

        case ReflectionKind.promise:
            throw new Error('Binary serialization not supported for Promise types');

        // ###################### COLLECTION RUNTYPES ######################
        // Types that contain other types as members
        case ReflectionKind.objectLiteral:
        case ReflectionKind.intersection: {
            const rt = runType as InterfaceRunType;
            if (rt.isCallable()) return comp.compile(rt.getCallSignature(), 'S', fnID);
            if (runType.src.subKind === ReflectionSubKind.nonSerializable) {
                throw new Error('Binary serialization is disabled for Non Serializable types');
            } else {
                // we need to ensure non optional properties are serialized first so then we can restore the object correctly
                // non optional properties are restored as: '{a: deserializeA, b: deserializeB, c: deserializeC};
                // and must be serialized/deserialized in the same order they are declared in the type
                const {required, optional, indexSignatures} = rt.splitJitSplitChildren(comp);

                if (indexSignatures.length) {
                    return comp.compile(indexSignatures[0], 'S', fnID); // index signature code already contains the loop
                }

                const requiredProps = required.map((prop) => comp.compile(prop, 'S', fnID).code);
                const requiredPropsCode = requiredProps.join(';');

                let optionalPropsCode = '';
                if (optional.length) {
                    const {bitMapInit, bitMIndexVar} = getOptionalPropsItems(rt, comp, optional.length);
                    const propsCode = optional
                        .map((prop, i) => {
                            prop.optionalIndex = i;
                            const modIndex = i + 1;
                            const shouldIncreaseBufferIndex = modIndex % 8 === 0;
                            const propCode = comp.compile(prop, 'S', fnID).code;
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
                case ReflectionSubKind.set: {
                    const rt = runType as IterableRunType;
                    const sεr = comp.args.sεr;
                    const entry = rt.getCustomVλl(comp)?.vλl || comp.vλl;
                    const jitChildren = rt.getJitChildren(comp);
                    const childrenCode = jitChildren
                        .map((c) => comp.compile(c, 'S', fnID).code)
                        .filter(Boolean)
                        .join(';');
                    // Serialize length at the beginning, then iterate and serialize items
                    const setLength = `${sεr}.view.setUint32(${sεr}.index, ${comp.vλl}.size, 1); ${sεr}.index += 4;`;
                    return {
                        code: `${setLength} for (const ${entry} of ${comp.vλl}) {${childrenCode}}`,
                        type: 'S',
                    };
                }
                case ReflectionSubKind.nonSerializable:
                    throw new Error('Binary serialization disabled for Non Serializable types');
                default: {
                    const rt = runType as InterfaceRunType;
                    if (rt.isCallable()) {
                        const callSignature = rt.getCallSignature();
                        if (callSignature) return comp.compile(callSignature, 'S', fnID);
                    }
                    const originalKind = runType.src.kind;
                    (runType.src as any).kind = ReflectionKind.objectLiteral;
                    const result = emitToBinary(runType, comp);
                    (runType.src as any).kind = originalKind;
                    return result;
                }
            }
            break;

        case ReflectionKind.infer:
            throw new Error('Infer is not supported in Binary serialization');

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const skip = rt.skipJit(comp);
            if (skip) return {code: undefined, type: 'S'};
            const params = rt.getParamRunTypes(comp);
            if (params.length === 0) return {code: undefined, type: 'S'};
            const paramsCode = params.map((p) => comp.compile(p, 'S', fnID).code).join(';');
            return {code: paramsCode, type: 'S'};
        }
        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in Binary serialization');

        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            rt.checkNonSkipTypes(comp);
            const {simpleItems, objectTypes} = rt.getUnionChildren(comp);
            const totalLength = simpleItems.length + objectTypes.length;
            if (totalLength > MAX_UNION_ITEMS) {
                throw new Error(
                    `Binary serialization not supported for Union with more than ${MAX_UNION_ITEMS} items.` +
                        ` Found ${totalLength} in ${rt.getUnionTypeNames()}`
                );
            }

            const errName = `uErr${comp.getNestLevel(rt)}`;
            const fail = `throw new Error(${errName});`;
            comp.setContextItem(
                errName,
                `const ${errName} = "Can not encode union to binary: item does not belong to the union"`
            );

            const ifElse = createIfElseFn();
            const onUnionItems = (items: BaseRunType[]) => {
                const result = items.map((childRt) => {
                    const toJit = comp.compile(childRt, 'S', fnID);
                    const encodeCode = toJit.code || '';
                    const index = rt.getUnionItemIndex(comp, childRt);
                    const isUint16 = index > 255;
                    const writeIndex = isUint16
                        ? `${sεr}.view.setUint16(${sεr}.index, ${index}, 1, (${sεr}.index += 2))`
                        : `${sεr}.view.setUint8(${sεr}.index++, ${index})`;
                    const isTypeCode = rt.getChildStrictIsType(childRt, comp);
                    return `${ifElse()} (${isTypeCode}) {${writeIndex};${encodeCode}}`;
                });
                return result.filter(Boolean);
            };

            const itemsCode = onUnionItems(simpleItems);
            if (!objectTypes.length) return {code: `${itemsCode.join('')} else {${fail}}`, type: 'S'};
            // these need to be in correct order for else if to work properly
            const nonObjectFail = `${ifElse()} (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) {${fail}}`;
            const objItemsCode = onUnionItems(objectTypes);
            const allFail = `${ifElse(true)} {${fail}}`;
            return {code: [...itemsCode, nonObjectFail, ...objItemsCode, allFail].join(''), type: 'S'};
        }

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

function emitToBinaryAs(rt: BaseRunType, comp: BinaryCompiler, kind: ReflectionKind): JitCode {
    const originalKind = rt.src.kind;
    (rt.src as any).kind = kind;
    const result = emitToBinary(rt, comp);
    (rt.src as any).kind = originalKind;
    return result;
}
