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
import {markDiscriminators, splitUnionTypes} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';

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
        return splitUnionTypes(comp, this, children);
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
        const {regularTypes, objectTypes} = this.getUnionChildren(comp);
        const items = regularTypes.map((rt) => this.getChildStrictIsType(rt, comp));
        const checkItems = items.filter(Boolean).join(' || ');
        if (!objectTypes.length) return `(${checkItems})`;
        const objItems = objectTypes.map((rt) => this.getChildStrictIsType(rt, comp));
        const objCode = objItems.filter(Boolean).join(' || ');
        const checkObjs = `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && (${objCode}))`;
        return `(${[checkItems, checkObjs].filter(Boolean).join(' || ')})`;
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
        const {regularTypes, objectTypes} = this.getUnionChildren(comp);
        const errVarName = `uErr${this.getNestLevel()}`;
        const fail = `throw new Error(${errVarName});`;
        comp.contextCodeItems.set(
            errVarName,
            `const ${errVarName} = "Can not encode json to union: expected one of <${this.getUnionTypeNames()}>"`
        );
        let isFirst = true;
        const onUnionTypes = (items: BaseRunType[]) => {
            return items.map((child) => {
                const iF = isFirst ? 'if' : 'else if';
                isFirst = false;
                const childCode = child.compileToJsonVal(comp) || '';
                const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
                const encodeCode = isExpression && childCode ? `${comp.vλl} = ${childCode};` : childCode;
                const itemIsType = this.getChildStrictIsType(child, comp);
                // item encoded before reassigning varName to [i, item]
                const index = this.getUnionItemIndex(comp, child);
                return `${iF} (${itemIsType}) {${encodeCode} ${comp.vλl} = [${index}, ${comp.vλl}]}`;
            });
        };

        const itemsCode = onUnionTypes(regularTypes);
        if (!objectTypes.length) return `${itemsCode.join('')} else {${fail}}`;
        const checkObjs = `${isFirst ? 'if' : 'else if'} (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) {${fail}}`;
        const objItemsCode = onUnionTypes(objectTypes);
        const childrenCode = [...itemsCode, checkObjs, ...objItemsCode].filter(Boolean).join('');
        const code = ` ${childrenCode} else {${fail}} `;
        return code;
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileFromJsonVal(comp: JitCompiler): jitCode {
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
                const index = this.getUnionItemIndex(comp, child);
                return `${iF} (${decVar} === ${index}) {${code}}`;
            })
            .filter(Boolean);
        const childrenCode = childrenItems.join('');
        const checkIndex = childrenCode
            ? `if (${decVar} < 0 || ${decVar} > ${children.length}) { throw new Error('Can not decode union from json: expected index between 0 and ${children.length}') }`
            : '';
        const code = `
            if (!Array.isArray(${comp.vλl}) || ${comp.vλl}.length !== 2) { throw new Error('Can not decode union from json: expected format [index, value]') }
            const ${decVar} = ${comp.vλl}[0]; ${comp.vλl} = ${comp.vλl}[1];
            ${checkIndex}
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
