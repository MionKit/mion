/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../../constants.kind.ts';
import {jitBinarySerializerArgs, JitFunctions} from '../../constants.functions.ts';
import {createIfElseFn} from '../../lib/utils.ts';
import {MAX_UNION_ITEMS} from '../../constants.ts';
import type {JitCode} from '../../types.ts';
import type {BaseRunType} from '../../lib/baseRunTypes.ts';
import type {BaseFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {ArrayRunType} from '../../nodes/member/array.ts';
import type {PropertyRunType} from '../../nodes/member/property.ts';
import type {InterfaceRunType} from '../../nodes/collection/interface.ts';
import type {IndexSignatureRunType} from '../../nodes/member/indexProperty.ts';
import type {ParameterRunType} from '../../nodes/member/param.ts';
import type {TupleRunType} from '../../nodes/collection/tuple.ts';
import type {UnionRunType} from '../../nodes/collection/union.ts';
import type {IterableRunType} from '../../nodes/native/Iterable.ts';
import type {LiteralRunType} from '../../nodes/atomic/literal.ts';

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
            return {code: `${sεr}.serString(${comp.vλl}.toString(), true)`, type: 'S'};
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
            // runtime value is a plain string
            return {code: `${sεr}.serString(${comp.vλl})`, type: 'S'};
        case ReflectionKind.literal: {
            if (comp.opts.noLiterals) {
                const lit = (runType as LiteralRunType).src.literal;
                if (lit instanceof RegExp) return emitToBinaryAs(runType, comp, ReflectionKind.regexp);
                switch (typeof lit) {
                    case 'string':
                        return emitToBinaryAs(runType, comp, ReflectionKind.string);
                    case 'number':
                        return emitToBinaryAs(runType, comp, ReflectionKind.number);
                    case 'boolean':
                        return emitToBinaryAs(runType, comp, ReflectionKind.boolean);
                    case 'bigint':
                        return emitToBinaryAs(runType, comp, ReflectionKind.bigint);
                    case 'symbol':
                        return emitToBinaryAs(runType, comp, ReflectionKind.symbol);
                    default:
                        throw new Error(`Unsupported literal type ${typeof lit}`);
                }
            }
            return {code: '', type: 'S'}; // literals can be skipped as we restore the value directly from runType in jit code
        }

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
            const lengthVar = comp.getLocalVarName('cnt', rt);
            const indexVar = comp.getLocalVarName('piI', rt);
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
                const {bitMIndexVar, bitIndex} = getOptionalBitmapItems(parent, comp, 0, rt.optionalIndex, false);
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
            // Optional handling uses bitmap set at tuple level
            const optionalIndex = (rt as any).optionalIndex;
            const bitMIndexVar = (rt as any)._bitmapVar;
            const isFnParam = (rt as any)._isFnParam;
            // Treat as optional if either isOptional() is true OR it's a function param (all fn params are optional in binary)
            const isOptional = rt.isOptional() || isFnParam;
            if (isOptional && optionalIndex !== undefined && bitMIndexVar) {
                const bitIndex = optionalIndex & 7; // equivalent to optionalIndex % 8
                const setBitMask = `${sεr}.setBitMask(${bitMIndexVar}, ${bitIndex})`;
                return {code: `if (${comp.getChildVλl()} !== undefined) {${itemJit.code};${setBitMask}}`, type: 'S'};
            }
            return itemJit;
        }

        case ReflectionKind.promise:
            throw new Error('Jit compilation disabled for Non Serializable types.');

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
                    const {bitMapInit, bitMIndexVar} = getOptionalBitmapItems(rt, comp, optional.length, 0, false);
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

            // For function params, all params are treated as optional in binary serialization
            // This allows sending null/undefined values over the wire even if the type is not optional
            const isFnParams = runType.src.subKind === ReflectionSubKind.params;

            // Split params into required, optional, and rest
            // For function params, all non-rest params are treated as optional
            const required = isFnParams ? [] : params.filter((p) => !p.isOptional() && !p.isRest());
            const optional = isFnParams ? params.filter((p) => !p.isRest()) : params.filter((p) => p.isOptional() && !p.isRest());
            const rest = params.filter((p) => p.isRest());

            // Serialize required params first
            const requiredCode = required.map((p) => comp.compile(p, 'S', fnID).code).join(';');

            // Serialize optional params with bitmap (groups of 8)
            let optionalCode = '';
            if (optional.length) {
                const {bitMapInit, bitMIndexVar} = getOptionalBitmapItems(rt, comp, optional.length, 0, true);
                const optionalParamsCode = optional
                    .map((p, i) => {
                        (p as any).optionalIndex = i; // set optionalIndex for use in tupleMember case
                        (p as any)._bitmapVar = bitMIndexVar; // pass bitmap variable name to tupleMember case
                        (p as any)._isFnParam = isFnParams; // flag to indicate this is a function param
                        const paramCode = comp.compile(p, 'S', fnID).code || '';
                        const modIndex = i + 1;
                        const shouldIncreaseBufferIndex = modIndex % 8 === 0 && modIndex < optional.length;
                        const increaseIndex = shouldIncreaseBufferIndex ? `${bitMIndexVar}++;` : '';
                        return `${paramCode} ${increaseIndex}`;
                    })
                    .join('');
                optionalCode = `${bitMapInit}\n${optionalParamsCode}`;
            }

            // Serialize rest params (handled as array by the rest param itself)
            const restCode = rest.map((p) => comp.compile(p, 'S', fnID).code).join(';');

            const allCode = [requiredCode, optionalCode, restCode].filter(Boolean).join(';');
            return {code: allCode, type: 'S'};
        }
        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in Binary serialization');

        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            rt.checkAllowedChildren(comp);
            const {simpleItems, objectTypes, anyItem} = rt.getUnionChildren(comp);
            const totalLength = simpleItems.length + objectTypes.length + (anyItem ? 1 : 0);
            if (totalLength > MAX_UNION_ITEMS) {
                throw new Error(
                    `Binary serialization not supported for Union with more than ${MAX_UNION_ITEMS} items.` +
                        ` Found ${totalLength} in ${rt.getUnionTypeNames()}`
                );
            }
            const errName = comp.getLocalVarName('uErr', rt);
            const fail = `throw new Error(${errName});`;
            comp.setContextItem(
                errName,
                `const ${errName} = "Can not encode union to binary: item does not belong to the union"`
            );
            const ifElse = createIfElseFn();
            // Helper to generate encode code for a union item
            const getEncodeCode = (childRt: BaseRunType) => {
                const toJit = comp.compile(childRt, 'S', fnID);
                const encodeCode = toJit.code || '';
                const index = rt.getUnionItemIndex(comp, childRt);
                const isUint16 = index > 255;
                const writeIndex = isUint16
                    ? `${sεr}.view.setUint16(${sεr}.index, ${index}, 1, (${sεr}.index += 2))`
                    : `${sεr}.view.setUint8(${sεr}.index++, ${index})`;
                return `${writeIndex};${encodeCode}`;
            };
            // Generate code for simple items (atomic types)
            const simpleCode = simpleItems.map((childRt) => {
                const isTypeCode = rt.getChildIsTypeWithLooseCheck(childRt, comp);
                return `${ifElse()} (${isTypeCode}) {${getEncodeCode(childRt)}}`;
            });
            // Generate code for object types (need null guard)
            const objCode = objectTypes.length
                ? objectTypes.map((childRt) => {
                      const isTypeCode = rt.getChildIsTypeWithLooseCheck(childRt, comp);
                      return `${ifElse()} (typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && ${isTypeCode}) {${getEncodeCode(childRt)}}`;
                  })
                : [];
            // Generate code for anyItem (always matches, checked last as fallback)
            const anyCode = anyItem ? `${ifElse(true)} {${getEncodeCode(anyItem)}}` : `${ifElse(true)} {${fail}}`;
            return {code: [...simpleCode, ...objCode, anyCode].join(''), type: 'S'};
        }
        default:
            throw new Error(`Binary serialization not supported for ${ReflectionKind[kind]} types`);
    }

    // Default return for cases that break without returning
    return {code: undefined, type: 'S'};
}

/** Generates bitmap initialization code for optional properties/params. Uses 1 bit per optional item (8 items per byte). */
function getOptionalBitmapItems(
    rt: InterfaceRunType | TupleRunType,
    comp: BinaryCompiler,
    optionalLength = 0,
    currentIndex = 0,
    isTuple = false
) {
    const sεr = comp.args.sεr;
    const prefix = isTuple ? 't' : '';
    const bitMIndexVar = comp.getLocalVarName(`${prefix}bmI`, rt); // index of the bitmap
    const bitmapLength = Math.ceil(optionalLength / 8);
    const bitIndex = `${currentIndex} & 7`; // equivalent to index % 8
    // initialize bitmap to zero as there could be values left from previous serialization
    const indexVar = comp.getLocalVarName(`${prefix}iBl`, rt);
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
