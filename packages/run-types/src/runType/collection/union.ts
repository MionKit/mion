/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeUnion} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitFnID, jitCode} from '../../types';
import type {FlattenedProp, PlainItem} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {CodeType, JitFunctions} from '../../constants';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';
import {isFlattenedItem, iterateAndCompileUnionEncode} from '@mionkit/run-types/src/runType/collection/unionIterator';
import {markDiscriminators} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
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
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.toCode.id:
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

    getUnionItemIndex(comp: JitCompiler, unionItem: BaseRunType): number {
        const children = this.getJitChildren(comp);
        const index = children.findIndex((child) => child === unionItem);
        if (index === -1) throw new Error(`Item ${unionItem.getTypeName()} not found in union ${this.getTypeName()}`);
        return index;
    }

    // #### collection's jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp);
        markDiscriminators(comp, this, children);
        const childrenCode = children.map((item) => item.compileIsType(comp)).filter(Boolean);
        if (childrenCode.length === 0) return undefined;
        return `(${childrenCode.join(' || ')})`;
    }

    // this version just heck if has error and return an single error in the root of the union.
    // if all types we cant know one the user was trying to use.
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        // TODO: enforce strictTypes to ensure no extra properties of the union go unchecked
        const isType = this.compileIsType(comp);
        const code = `if (!${isType}) ${comp.callJitErr(this)};`;
        return code;
    }

    /**
     * When a union is encode to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const okVarName = `uOk${this.getNestLevel()}`;
        const errVarName = `uEr_${this.getJitHash(comp.opts)}`;
        const errConst = `const ${errVarName} = 'Can not encode json to union: expected one of <${this.getUnionTypeNames()}>'`;
        comp.contextCodeItems.set(errVarName, errConst);
        const encodeUnionType = (item: PlainItem) => {
            const isFlattered = isFlattenedItem(comp, this, item.rt);
            const discriminatorTuple = `${comp.vλl} = [${item.unionIndex}, ${comp.vλl}]; ${okVarName} = true;`;
            if (isFlattered) return discriminatorTuple;
            const childCode = item.rt.compileToJsonVal(comp) || '';
            const isExpression = childIsExpression(JitFunctions.toJsonVal.id, item.rt);
            const encodeChildren = isExpression && childCode ? `${comp.vλl} = ${childCode};` : childCode;
            return `${encodeChildren} ${discriminatorTuple}`;
        };
        const encodeFlattenedProp = (item: FlattenedProp) => {
            const childCode = item.prop.compileToJsonVal(comp) || '';
            const isExpression = childIsExpression(JitFunctions.toJsonVal.id, item.prop);
            const encodeCode = isExpression && childCode ? `${comp.vλl} = ${childCode};` : childCode;
            return `${encodeCode}`;
        };
        const onFailed = () => `if (!${okVarName}) throw new Error(${errVarName});`;
        const initCode = `let ${okVarName} = false;`;
        const code = initCode + iterateAndCompileUnionEncode(comp, this, encodeUnionType, encodeFlattenedProp, onFailed);
        return code;
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        // TODO: enforce strictTypes to ensure no extra properties of the union go unchecked
        const decVar = `dεc${this.getNestLevel()}`;
        const children = this.getJitChildren(comp);
        const childrenItems = children
            .map((child, i) => {
                const iF = i === 0 ? 'if' : 'else if';
                const childCode = child.compileFromJsonVal(comp) || '';
                const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
                const code = isExpression && childCode && childCode !== comp.vλl ? `${comp.vλl} = ${childCode}` : childCode;
                if (!code) return '';
                // item is decoded before being extracted from the array
                return `${iF} (${decVar} === ${i}) {${code}}`;
            })
            .filter(Boolean);
        const childrenCode = childrenItems.join('');
        const code = `
            if (!Array.isArray(${comp.vλl}) || ${comp.vλl}.length !== 2) { throw new Error('Can not decode union from json: expected format [discriminator, value]') }
            const ${decVar} = ${comp.vλl}[0]; ${comp.vλl} = ${comp.vλl}[1];
            if (${decVar} < 0 || ${decVar} > ${children.length}) { throw new Error('Can not decode union from json: expected unionItemIndex between 0 and ${children.length}') }
            ${childrenCode}
        `;
        return code;
    }

    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getTypeName())
            .join(' | ');
    }
}
