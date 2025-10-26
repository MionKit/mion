/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import {jitUtils} from '@mionkit/core';
import {ReflectionSubKind} from '../../constants.kind';
import {childIsExpression, createIfElseFn, isSafePropName, toLiteral} from '../../lib/utils';
import {jitBinaryDeserializerArgs, JitFunctions} from '../../constants.functions';
import {MAX_UNION_ITEMS} from '../../constants';
import type {JitCode} from '../../types';
import type {BaseRunType} from '../../lib/baseRunTypes';
import {type BaseFnCompiler} from '../../lib/jitFnCompiler';
import type {LiteralRunType} from '../../runType/atomic/literal';
import type {ArrayRunType} from '../../runType/member/array';
import type {PropertyRunType} from '../../runType/member/property';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {IndexSignatureRunType} from '../../runType/member/indexProperty';
import type {ClassRunType} from '../../runType/collection/class';
import type {TupleRunType} from '../../runType/collection/tuple';
import type {ParameterRunType} from '../../runType/member/param';
import type {RestParamsRunType} from '../../runType/member/restParams';
import type {UnionRunType} from '../../runType/collection/union';
import type {IterableRunType} from '../../runType/native/Iterable';
import type {MapRunType} from '../../runType/native/map';

type BinaryCompiler = BaseFnCompiler<typeof jitBinaryDeserializerArgs, typeof JitFunctions.fromBinary.id>;

const fnID = JitFunctions.fromBinary.id;

/**
 * Main Binary deserialization compiler function
 * Generates JIT code to deserialize Binary data to JavaScript values
 */
export function emitFromBinary(runType: BaseRunType, comp: BinaryCompiler): JitCode {
    const src = runType.src;
    const kind = src.kind;
    const dεs = comp.args.dεs;

    // hack is used in some case to increase the index passing an extra argument to view.get methods
    // ie: view.getUint32(index, littleEndian, index += 4);
    // getUint32 only accepts 2 arguments, but we use the 3rd one to increase the index on a single statement so code can be used as an expression

    switch (kind) {
        // ###################### ATOMIC TYPES ######################
        case ReflectionKind.unknown:
        case ReflectionKind.any: {
            // any is deserialized from json string
            return {code: `JSON.parse(${dεs}.desString())`, type: 'E'};
        }
        case ReflectionKind.null:
            return {code: `(${dεs}.index++, null)`, type: 'E'};
        case ReflectionKind.boolean:
            return {code: `${dεs}.view.getUint8(${dεs}.index++) === 1`, type: 'E'};
        case ReflectionKind.number: {
            return {code: `${dεs}.view.getFloat64(${dεs}.index, 1, (${dεs}.index += 8))`, type: 'E'};
        }
        case ReflectionKind.string: {
            return {code: `${dεs}.desString()`, type: 'E'};
        }
        case ReflectionKind.bigint: {
            return {code: `BigInt(${dεs}.desString())`, type: 'E'};
        }
        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return {code: `(${dεs}.index++, undefined)`, type: 'E'};
        case ReflectionKind.symbol: {
            return {code: `Symbol(${dεs}.desString() || undefined)`, type: 'E'};
        }
        case ReflectionKind.regexp: {
            return {code: `new RegExp(${dεs}.desString(), ${dεs}.desString())`, type: 'E'};
        }
        case ReflectionKind.object:
            // similar to any, this is deserialized as json string
            return {code: `JSON.parse(${dεs}.desString())`, type: 'E'};
        case ReflectionKind.enum: {
            return {code: `${dεs}.desEnum()`, type: 'E'};
        }
        case ReflectionKind.enumMember:
            throw new Error('Binary deserialization not supported for enum member types');
        case ReflectionKind.never:
            throw new Error('Never type cannot be deserialized from Binary');
        case ReflectionKind.templateLiteral:
            throw new Error('Template literals are not supported in Binary deserialization');
        case ReflectionKind.literal:
            return {code: toLiteral((runType as LiteralRunType).src.literal), type: 'E'};
        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.rest: // rest params are deserialized as array but start at rest item index
        case ReflectionKind.array: {
            const rt = runType as ArrayRunType | RestParamsRunType;
            rt.checkNonSkipTypes(comp);
            const child = rt.getMemberType()!;
            const childCode = comp.compile(child, 'S', fnID);
            if (!childCode?.code) throw new Error(`Do not know how to deserialize Array<${child.getTypeName()}> from Binary.`);
            const isRest = rt.src.kind === ReflectionKind.rest;
            const index = rt.getChildVarName(comp);
            const isExpression = childIsExpression(childCode, child);
            const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
            // deserialized from [length, items...]
            const lengthVal = comp.getLocalVarName('arrL', rt);
            const arrayInit = isRest ? '' : `${comp.vλl} = new Array(${lengthVal})`; // res array already initialized in parent
            return {
                code: `
                const ${lengthVal} = ${dεs}.view.getUint32(${dεs}.index, 1); ${dεs}.index += 4; ${arrayInit};
                for (let ${index} = ${rt.startIndex(comp)}; ${index} < ${lengthVal}; ${index}++) {${code}}
            `,
                type: 'S',
            };
        }

        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = (rt.src as any).index?.kind;
            const memberCode = comp.compile(rt.getJitChild(comp), 'S', fnID);
            if (!memberCode?.code) return {code: undefined, type: 'E'};

            const prop = rt.getChildVarName(comp);
            const countVar = comp.getLocalVarName('cnt', rt);
            const indexVar = comp.getLocalVarName('propI', rt);

            // Deserialize key based on index type
            let keyDeserializationCode: string;
            if (indexKind === ReflectionKind.number) {
                // For number indices, deserialize as uint32
                keyDeserializationCode = `const ${prop} = ${dεs}.view.getUint32(${dεs}.index, 1); ${dεs}.index += 4;`;
            } else {
                // For string indices (default), deserialize as string
                keyDeserializationCode = `const ${prop} = ${dεs}.desString();`;
            }

            const memberInit = memberCode.type === 'E' ? `${comp.vλl}[${prop}] = ${memberCode.code};` : memberCode.code;
            const deserializeCode = `for (let ${indexVar} = 0; ${indexVar} < ${countVar}; ${indexVar}++) {${keyDeserializationCode}${memberInit}}`;

            return {
                code: `const ${countVar} = ${dεs}.view.getUint32(${dεs}.index, 1); ${dεs}.index += 4; ${comp.vλl} = {}; ${deserializeCode}`,
                type: 'S',
            };
        }

        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            if (runType.src.subKind === ReflectionSubKind.params) {
                return emitFromBinaryAs(runType, comp, ReflectionKind.tuple);
            } else {
                throw new Error(
                    'Binary deserialization not supported for functions, call compileParams or compileReturn instead.'
                );
            }

        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            switch (src.subKind) {
                case ReflectionSubKind.mapKey:
                case ReflectionSubKind.mapValue:
                case ReflectionSubKind.setItem: {
                    const child = rt.getJitChild(comp);
                    const childJit = comp.compile(child, 'S', fnID);
                    if (!childJit?.code || !child)
                        throw new Error(`Do not know how to deserialize ${rt.getTypeName()} from Binary.`);
                    const parent = rt.getParent()!;
                    const parentVλl = parent.getCustomVλl(comp)?.vλl || comp.vλl;
                    const vλl = rt.getCustomVλl(comp)?.vλl;
                    const isExpression = childIsExpression(childJit, child);
                    const code = isExpression ? `const ${vλl} = ${childJit.code};` : childJit.code || '';
                    let setOperation = '';
                    switch (rt.src.subKind) {
                        case ReflectionSubKind.mapKey:
                            break; // we set map item once we have the key and value
                        case ReflectionSubKind.mapValue: {
                            const mapKey = (parent as MapRunType).getMapKeyVλl(comp); // not the best solution but works
                            setOperation = `${parentVλl}.set(${mapKey}, ${vλl})`;
                            break;
                        }
                        case ReflectionSubKind.setItem:
                            setOperation = `${parentVλl}.add(${vλl})`;
                            break;
                    }
                    return {code: `${code}; ${setOperation};`, type: 'S'};
                }
                default:
                    return emitFromBinaryAs(runType, comp, ReflectionKind.tupleMember);
            }
        }

        case ReflectionKind.property:
        case ReflectionKind.propertySignature: {
            const rt = runType as PropertyRunType;
            const parent = rt.getParent() as InterfaceRunType;
            const child = rt.getJitChild(comp)!;
            const childJit = comp.compile(child, 'S', fnID);
            if (rt.isOptional()) {
                const {bitMIndexVar, bitIndex} = getOptionalPropsItems(parent, comp, 0, rt.optionalIndex);
                const initCode = childJit.type === 'E' ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code;
                return {
                    code: `if (${dεs}.view.getUint8(${bitMIndexVar}, 1) & (1 << (${bitIndex}))) {${initCode}}`,
                    type: 'S',
                };
            }
            // block or statements code are initialized as obj.a = deserializeA; obj.b = deserializeB; after initial object has been created
            const isExpression = childIsExpression(childJit, child);
            if (!isExpression) {
                return childJit; // block statements already include variable assignment
            }
            // required props that are simple expressions code are part of an object constructor {a: deserializeA, b: deserializeB, c: deserializeC}
            const propName = getPropName(rt, comp, true);
            return {code: `${propName}:${childJit?.code}`, type: 'E'};
        }

        case ReflectionKind.tupleMember: {
            const rt = runType as ParameterRunType;
            const childJit = comp.compile(rt.getJitChild(comp), 'S', fnID);
            const nullJIt = emitFromBinaryAs(rt, comp, ReflectionKind.undefined);
            const itemJit = childJit?.code ? childJit : nullJIt; // if child is not serializable, we serialize null as need to fill the space in the tuple
            const initCode = itemJit.type === 'E' ? `${comp.getChildVλl()} = ${itemJit.code}` : itemJit.code;
            if (rt.isRest()) return itemJit;
            if (rt.isOptional()) {
                // todo, we could optimize this by using bitmap mask to use a single bit per optional param (similar to what we do for properties)
                const code = `if (${dεs}.view.getUint8(${dεs}.index++) === 1){${initCode}}`;
                return {code, type: 'S'};
            }
            return {code: initCode, type: 'S'};
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
                throw new Error('Binary deserialization is disabled for Non Serializable types');
            } else {
                const {required, optional, indexSignatures} = rt.splitJitSplitChildren(comp);
                if (indexSignatures.length) {
                    return comp.compile(indexSignatures[0], 'S', fnID); // index signature code already contains the loop
                }

                // required props that are simple expressions are restored as: '{a: deserializeA, b: deserializeB, c: deserializeC};
                // and are serialized/deserialised in the same order they are declared in the type
                const requiredItemsJit = required.map((prop) => comp.compile(prop, 'S', fnID));
                const expressionItemsJit = requiredItemsJit
                    .filter((childJit, i) => childIsExpression(childJit, required[i]))
                    .map((prop) => prop.code)
                    .filter(Boolean);
                const statementItemsCode = requiredItemsJit
                    .filter(Boolean)
                    .filter((childJit, i) => !childIsExpression(childJit, required[i]))
                    .map((prop) => prop.code);
                const expressionsPropsCode = expressionItemsJit.join(',');
                const requiredPropsCode = statementItemsCode.join(';');

                // optional props are initialized as obj.a = deserializeA; obj.b = deserializeB; obj.c = deserializeC;
                // bitmap is used to determine which optional props are present
                // header format: [bitmap, optional props]
                let optionalPropsCode = '';
                if (optional.length) {
                    // optional properties are restored using a loop
                    const {bitMapInit, bitMIndexVar} = getOptionalPropsItems(rt, comp, optional.length);
                    const propsCode = optional
                        .map((prop, i) => {
                            prop.optionalIndex = i;
                            const modIndex = i + 1;
                            const shouldIncreaseBufferIndex = modIndex % 8 === 0;
                            const propCode = comp.compile(prop, 'S', fnID).code;
                            if (!shouldIncreaseBufferIndex) return propCode;
                            // every 8 props we need to increase the bitmap index
                            return `${propCode} ${bitMIndexVar}++; `;
                        })
                        .filter(Boolean)
                        .join('');
                    const sep = requiredPropsCode ? ';' : '';
                    optionalPropsCode = `${sep}\n${bitMapInit}\n${propsCode}`;
                }

                const canBeExpression = !requiredPropsCode && !optionalPropsCode;
                if (canBeExpression) return {code: `{${expressionsPropsCode}}`, type: 'E'};
                return {code: `${comp.vλl} = {${expressionsPropsCode}}\n${requiredPropsCode}${optionalPropsCode}`, type: 'S'};
            }
        }
        case ReflectionKind.class:
            switch (runType.src.subKind) {
                case ReflectionSubKind.date:
                    return {code: `new Date(${dεs}.view.getFloat64(${dεs}.index, 1, (${dεs}.index += 8)))`, type: 'E'};
                case ReflectionSubKind.map:
                case ReflectionSubKind.set: {
                    const rt = runType as IterableRunType;
                    const children = rt.getJitChildren(comp);
                    const vλl = rt.getCustomVλl(comp)?.vλl || comp.vλl;
                    const initCode = `const ${vλl} = new ${rt.constructorName}()`;
                    if (!children.length) return {code: `new ${rt.constructorName}()`, type: 'E'};
                    const childrenCode = children
                        .map((c) => comp.compile(c, 'S', fnID).code)
                        .filter(Boolean)
                        .join(';');
                    if (!childrenCode) return {code: initCode, type: 'E'};
                    const index = comp.getLocalVarName('itI', rt);
                    const lengthVar = comp.getLocalVarName('itL', rt);
                    const readLength = `const ${lengthVar} = ${dεs}.view.getUint32(${dεs}.index, 1); ${dεs}.index += 4`;
                    return {
                        code: `${initCode}; ${readLength}; for (let ${index} = 0; ${index} < ${lengthVar}; ${index}++) {${childrenCode}} ${comp.vλl} = ${vλl};`,
                        type: 'S',
                    };
                }
                case ReflectionSubKind.nonSerializable:
                    throw new Error('Binary deserialization disabled for Non Serializable types');
                default: {
                    const rt = runType as ClassRunType;
                    if (rt.isCallable()) {
                        const callSignature = rt.getCallSignature();
                        if (callSignature) return comp.compile(callSignature, 'S', fnID);
                    }
                    const originalKind = rt.src.kind;
                    (runType.src as any).kind = ReflectionKind.objectLiteral;
                    const plainObjCode = emitFromBinary(rt, comp);
                    (runType.src as any).kind = originalKind;
                    const desFnVarName = comp.getLocalVarName('desFn', rt);
                    const desFnInit = `let ${desFnVarName} = utl.${jitUtils.getDeserializeFn.name}(${toLiteral(rt.getClassName())})`;
                    const desFnCode = `if (${desFnVarName}) {${comp.vλl} = ${desFnVarName}(${comp.vλl})}`;
                    const desClassCode = `else if (${desFnVarName} = utl.${jitUtils.getSerializeClass.name}(${toLiteral(rt.getClassName())})) {${comp.vλl} = new ${desFnVarName}(${comp.vλl})}`;
                    const initCode = plainObjCode.type === 'E' ? `${comp.vλl} = ${plainObjCode.code}` : plainObjCode.code;
                    return {code: `${initCode};${desFnInit};${desFnCode} ${desClassCode}`, type: 'S'};
                }
            }
            break;

        case ReflectionKind.infer:
            throw new Error('Infer is not supported in Binary deserialization');

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const skip = rt.skipJit(comp);
            if (skip) return {code: undefined, type: 'S'};
            const params = rt.getParamRunTypes(comp);
            const hasFixedSize = params.every((p) => !p.isOptional() && !p.isRest());
            const initTuple = hasFixedSize ? `${comp.vλl} = new Array(${params.length});` : `${comp.vλl} = [];`;
            if (params.length === 0) return {code: initTuple, type: 'S'};
            const paramsCode = params.map((p) => comp.compile(p, 'S', fnID).code || '').join(';');
            return {code: `${initTuple}${paramsCode}`, type: 'S'};
        }
        case ReflectionKind.typeParameter:
            throw new Error('Type parameter not implemented in Binary deserialization');

        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            rt.checkNonSkipTypes(comp);
            const decVar = comp.getLocalVarName('dec', rt);
            const errVarName = comp.getLocalVarName('uErr', rt);
            comp.setContextItem(errVarName, `const ${errVarName} = "Can not binary decode union: invalid union index"`);
            const children = rt.getJitChildren(comp);
            if (children.length > MAX_UNION_ITEMS) {
                throw new Error(
                    `Binary deserialization not supported for Union with more than ${MAX_UNION_ITEMS} items.` +
                        ` Found ${children.length} in ${rt.getUnionTypeNames()}`
                );
            }
            const maxIndex = children.length - 1;
            const isUint16 = maxIndex > 255;
            const readIndex = isUint16
                ? `const ${decVar} = ${dεs}.view.getUint16(${dεs}.index, 1); ${dεs}.index += 2;`
                : `const ${decVar} = ${dεs}.view.getUint8(${dεs}.index++);`;
            const ifElse = createIfElseFn();
            const itemsCode = children
                .map((unionItem) => {
                    const childJit = comp.compile(unionItem, 'S', fnID);
                    const isExpression = childIsExpression(childJit, unionItem);
                    const code =
                        isExpression && childJit.code && childJit.code !== comp.vλl
                            ? `${comp.vλl} = ${childJit.code}`
                            : childJit.code || '';
                    const index = rt.getUnionItemIndex(comp, unionItem);
                    return `${ifElse()} (${decVar} === ${index}) {${code || '/*noop*/'}}`;
                })
                .filter(Boolean);
            const childrenCode = itemsCode.join('');
            const failCode = childrenCode ? `else {throw new Error(${errVarName})}` : '';
            const code = `
                ${readIndex}
                ${childrenCode}
                ${failCode}
            `;
            return {code, type: 'S'};
        }

        default:
            throw new Error(`Binary deserialization not supported for ${ReflectionKind[kind]} types`);
    }
    throw new Error(`Do not know how to deserialize ${runType.getTypeName()} from Binary.`);
}

function getPropName(rt: PropertyRunType, comp: BinaryCompiler, isObjectConstructor: boolean): string | number {
    const isSafe = isSafePropName(rt.src.name);
    if (isObjectConstructor) return isSafe ? rt.getChildVarName(comp) : rt.getChildLiteral(comp);
    return isSafe ? `.${rt.getChildVarName(comp)}` : `[${rt.getChildLiteral(comp)}]`;
}

function getOptionalPropsItems(rt: InterfaceRunType, comp: BinaryCompiler, optionalPropsLength = 0, currentPropIndex = 0) {
    const dεs = comp.args.dεs;
    const bitMIndexVar = comp.getLocalVarName('bimI', rt); // index of the optional prop loop
    const bitmapLength = Math.ceil(optionalPropsLength / 8);
    const bitIndex = `${currentPropIndex} & 7`; // equivalent to index % 8
    // bitmap for present optional props
    const bitMapInit = `${bitmapLength > 1 ? 'let ' : 'const'} ${bitMIndexVar} = ${dεs}.index; ${dεs}.index += ${bitmapLength};`;
    return {bitMIndexVar, bitmapLength, bitIndex, bitMapInit};
}

function emitFromBinaryAs(rt: BaseRunType, comp: BinaryCompiler, kind: ReflectionKind): JitCode {
    const originalKind = rt.src.kind;
    (rt.src as any).kind = kind;
    const result = emitFromBinary(rt, comp);
    (rt.src as any).kind = originalKind;
    return result;
}
