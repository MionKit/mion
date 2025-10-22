/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUnion} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitCode} from '../../types';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';
import {childIsExpression, createIfElseFn} from '../../lib/utils';
import {JitFunctions} from '../../constants.functions';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';
import {markDiscriminators, splitUnionItems} from './unionDiscriminator';

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

    isTypeWithProperties(rt: BaseRunType) {
        return (
            rt.getFamily() === 'C' &&
            (isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt))
        );
    }

    getUnionChildren(comp: JitCompiler) {
        const children = this.getJitChildren(comp);
        markDiscriminators(comp, this, children);
        return splitUnionItems(comp, this, children);
    }

    getUnionItemIndex(comp: JitCompiler, unionItem: BaseRunType): number {
        const children = this.getJitChildren(comp);
        const index = children.findIndex((child) => child === unionItem);
        if (index === -1) throw new Error(`Item ${unionItem.getTypeName()} not found in union ${this.getTypeName()}`);
        return index;
    }

    getChildStrictIsType(rt: BaseRunType, comp: JitCompiler): string {
        const isTypeCode = comp.compileIsType(rt, 'E').code || '';
        const isTypeWithProperties =
            isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt);
        if (!isTypeWithProperties || rt.getFamily() !== 'C') return isTypeCode;
        const props = rt.getJitChildren(comp);
        const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return isTypeCode;
        const hasUnknownKeysOptsVarName = `uKOpts${comp.getNestLevel(this)}`;
        const checkPropName = JitFunctions.hasUnknownKeys.runTimeOptions.checkNonJitProps.keyName;
        comp.setContextItem(hasUnknownKeysOptsVarName, `const ${hasUnknownKeysOptsVarName} = {${checkPropName}: true}`);
        // forces to call hasUnknownKeys with hasUnknownKeysOptsVarName options
        comp.setChildrenCallArgs(JitFunctions.hasUnknownKeys.id, {θpts: hasUnknownKeysOptsVarName});
        const codeHasUnknown = comp.compileHasUnknownKeys(rt, 'E').code;
        return codeHasUnknown ? `(${isTypeCode} && !${codeHasUnknown})` : `${isTypeCode}`;
    }

    visitIsType(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const items = simpleItems.map((rt) => this.getChildStrictIsType(rt, comp));
        const checkItems = items.filter(Boolean).join(' || ');
        if (!objectTypes.length) return {code: `(${checkItems})`, type: 'E'};
        const objItems = objectTypes.map((rt) => this.getChildStrictIsType(rt, comp));
        const objCode = objItems.filter(Boolean).join(' || ');
        const checkObjs = `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && (${objCode}))`;
        return {code: `(${[checkItems, checkObjs].filter(Boolean).join(' || ')})`, type: 'E'};
    }

    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const isType = comp.compileIsType(this, 'E').code;
        const code = `if (!${isType}) ${comp.callJitErr(this)};`;
        return {code, type: 'S'};
    }

    /**
     * When a union is encodes to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    visitToJsonVal(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const errName = `uErr${comp.getNestLevel(this)}`;
        const fail = `throw new Error(${errName});`;
        comp.setContextItem(errName, `const ${errName} = "Can not json encode union: item does not belong to the union"`);

        const ifElse = createIfElseFn();
        const onUnionItems = (items: BaseRunType[]) => {
            const result = items.map((childRt) => {
                const toJit = comp.compileToJsonVal(childRt, 'S');
                // TODO: calling full decode could be expensive and we calling it only to know if it needs encoding.
                // we might want to optimize this, call to decode is also being added to the context and should be removed
                const fromJit = comp.compileFromJsonVal(childRt, 'S');
                const needsTupleEncoding = !!toJit.code || !!fromJit.code;
                const isExpression = childIsExpression(toJit, childRt);
                const encodeCode = isExpression && toJit.code ? `${comp.vλl} = ${toJit.code};` : toJit.code || '';
                // item encoded before reassigning varName to [i, item]
                const index = this.getUnionItemIndex(comp, childRt);
                const tupleEncode = needsTupleEncoding ? `${comp.vλl} = [${index}, ${comp.vλl}]` : '/*noop*/';
                const isTypeCode = this.getChildStrictIsType(childRt, comp);
                return `${ifElse()} (${isTypeCode}) {${encodeCode} ${tupleEncode}}`;
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

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    visitFromJsonVal(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const decVar = `dεc${comp.getNestLevel(this)}`;
        const errVarName = `uErr${comp.getNestLevel(this)}`;
        comp.setContextItem(errVarName, `const ${errVarName} = "Can not json decode union: invalid union index"`);
        const children = this.getJitChildren(comp);
        const ifElse = createIfElseFn();
        const itemsCode = children
            .map((unionItem) => {
                const childJit = comp.compileFromJsonVal(unionItem, 'S');
                const isExpression = childIsExpression(childJit, unionItem);
                const code =
                    isExpression && childJit.code && childJit.code !== comp.vλl
                        ? `${comp.vλl} = ${childJit.code}`
                        : childJit.code || '';
                // item is decoded before being extracted from the array
                const index = this.getUnionItemIndex(comp, unionItem);
                return `${ifElse()} (${decVar} === ${index}) {${code || '/*noop*/'}}`;
            })
            .filter(Boolean);
        const childrenCode = itemsCode.join('');
        const failCode = childrenCode ? `else {throw new Error(${errVarName})}` : '';
        const code = `
            if (${comp.vλl}?.length === 2 && Array.isArray(${comp.vλl}) && typeof ${comp.vλl}[0] === 'number') {
                const ${decVar} = ${comp.vλl}[0]; ${comp.vλl} = ${comp.vλl}[1];
                ${childrenCode}
                ${failCode}
            }
        `;
        return {code, type: 'S'};
    }

    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getTypeName())
            .join(' | ');
    }

    checkNonSkipTypes(comp: JitCompiler) {
        const allChildren = this.getChildRunTypes();
        const toSkip = allChildren.filter((rt) => rt.skipJit(comp));
        if (toSkip.length) throw new Error(`Union can not have non serializable types, ie: Symbol, Function, etc.`);
    }
}
