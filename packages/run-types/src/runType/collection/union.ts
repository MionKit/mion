/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUnion} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitFnID, jitCode} from '../../types';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {CodeType, JitFunctions} from '../../constants';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';
import {
    FlattenedUnionProp,
    markDiscriminators,
    SimpleUnionItem,
} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {
    compileIsTypeUnion,
    iterateAndCompileUnionEncode,
    iterateAndCompileUnionDecode,
} from '@mionkit/run-types/src/runType/collection/unionIterator';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends CollectionRunType<TypeUnion> {
    hasDiscriminators: boolean | undefined = undefined;
    hasObjectTypes: boolean | undefined = undefined;
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.jsonStringify.id:
            case JitFunctions.toCode.id:
            case JitFunctions.isType.id:
                return 'RB';
            default:
                return super.getCodeType(fnID);
        }
    }

    isTypeWithProperties(rt: BaseRunType) {
        return (
            rt.getFamily() === 'C' &&
            (isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt))
        );
    }

    getUnionChildren(comp: JitCompiler) {
        const children = this.getJitChildren(comp);
        markDiscriminators(comp, this, children);
        // Simple split for backward compatibility
        const simpleTypes: BaseRunType[] = [];
        const objectTypes: BaseRunType[] = [];
        children.forEach((child) => {
            if (this.isTypeWithProperties(child)) {
                objectTypes.push(child);
            } else {
                simpleTypes.push(child);
            }
        });
        return {simpleTypes, objectTypes};
    }

    getUnionItemIndex(comp: JitCompiler, unionItem: BaseRunType): number {
        const children = this.getJitChildren(comp);
        const index = children.findIndex((child) => child === unionItem);
        if (index === -1) throw new Error(`Item ${unionItem.getTypeName()} not found in union ${this.getTypeName()}`);
        return index;
    }

    getChildStrictIsType(rt: BaseRunType, comp: JitCompiler) {
        const isTypeCode = rt.compileIsType(comp);
        const isTypeWithProperties =
            isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt);
        if (!isTypeWithProperties || rt.getFamily() !== 'C') return isTypeCode;
        const props = rt.getJitChildren(comp);
        const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return isTypeCode;
        const codeHasUnknown = rt.compileHasUnknownKeys(comp);
        return codeHasUnknown ? `(${isTypeCode} && !${codeHasUnknown})` : `${isTypeCode}`;
    }

    _compileIsType(comp: JitCompiler): jitCode {
        return compileIsTypeUnion(comp, this);
    }

    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const isType = this.compileIsType(comp);
        const code = `if (!${isType}) ${comp.callJitErr(this)};`;
        return code;
    }

    /**
     * When a union is encodes to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const onStart = () => '';
        const encodeUnionSimpleType = (item: SimpleUnionItem) => {
            const childCode = item.rt.compileToJsonVal(comp) || '';
            const isExpression = childIsExpression(JitFunctions.toJsonVal.id, item.rt);
            const encodeCode = isExpression && childCode ? `${comp.vλl} = ${childCode}` : childCode;
            // item encoded before reassigning varName to [i, item]
            return `${encodeCode}; ${comp.vλl} = [${item.unionIndex}, ${comp.vλl}]`;
        };
        // For flattened properties, encode each individual property
        const encodeFlattenedProp = (flatProp: FlattenedUnionProp) => flatProp.prop.compileToJsonVal(comp);
        const encodeFlattenedObject = (index: number) => `${comp.vλl} = [${index}, ${comp.vλl}]`;

        return iterateAndCompileUnionEncode(
            comp,
            this,
            onStart,
            encodeUnionSimpleType,
            encodeFlattenedProp,
            encodeFlattenedObject
        );
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const decodeUnionSimpleType = (item: SimpleUnionItem) => {
            const childDecode = item.rt.compileFromJsonVal(comp) || '';
            const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, item.rt);
            const code = isExpression && childDecode && childDecode !== comp.vλl ? `${comp.vλl} = ${childDecode}` : childDecode;
            return code;
        };
        // For flattened properties, decode each individual property
        const decodeFlattenedProp = (flatProp: FlattenedUnionProp) => flatProp.prop.compileFromJsonVal(comp);
        return iterateAndCompileUnionDecode(comp, this, decodeUnionSimpleType, decodeFlattenedProp);
    }

    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getTypeName())
            .join(' | ');
    }
}
