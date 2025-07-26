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
import {childIsExpression, createIfElseFn, toLiteral} from '../../lib/utils';
import {CodeType} from '../../constants.functions';
import {JitFunctions} from '../../constants.functions';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';
import {markDiscriminators, splitUnionItems} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import {JitFnArgs} from '@mionkit/core/src/types';

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
        return splitUnionItems(comp, this, children);
    }

    getUnionItemIndex(comp: JitCompiler, unionItem: BaseRunType): number {
        const children = this.getJitChildren(comp);
        const index = children.findIndex((child) => child === unionItem);
        if (index === -1) throw new Error(`Item ${unionItem.getTypeName()} not found in union ${this.getTypeName()}`);
        return index;
    }

    getChildIsTypeStrict(childRt: BaseRunType, comp: JitCompiler) {
        const isTypeCode = childRt.compileIsType(comp);
        const isTypeWithProperties =
            isInterfaceRunType(childRt) ||
            isClassRunType(childRt) ||
            isObjectLiteralRunType(childRt) ||
            isIntersectionRunType(childRt);
        if (!isTypeWithProperties || childRt.getFamily() !== 'C') return isTypeCode;
        const props = childRt.getJitChildren(comp);
        const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return isTypeCode;
        const hasUnknownKeysOptsVarName = `uKOpts${this.getNestLevel()}`;
        const checkPropName = JitFunctions.hasUnknownKeys.runTimeOptions.checkNonJitProps.keyName;
        comp.setContextItem(hasUnknownKeysOptsVarName, `const ${hasUnknownKeysOptsVarName} = {${checkPropName}: true}`);
        // forces to call hasUnknownKeys with hasUnknownKeysOptsVarName options
        comp.setChildrenCallArgs(JitFunctions.hasUnknownKeys.id, {θpts: hasUnknownKeysOptsVarName});
        const codeHasUnknown = childRt.compileHasUnknownKeys(comp);
        return codeHasUnknown ? `(${isTypeCode} && !${codeHasUnknown})` : `${isTypeCode}`;
    }

    _compileIsType(comp: JitCompiler): jitCode {
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const items = simpleItems.map((rt) => this.getChildIsTypeStrict(rt, comp));
        const checkItems = items.filter(Boolean).join(' || ');
        if (!objectTypes.length) return `(${checkItems})`;
        const objItems = objectTypes.map((rt) => this.getChildIsTypeStrict(rt, comp));
        const objCode = objItems.filter(Boolean).join(' || ');
        const checkObjs = `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && (${objCode}))`;
        return `(${[checkItems, checkObjs].filter(Boolean).join(' || ')})`;
    }

    getChildTypeErrorsStrict(childRt: BaseRunType, comp: JitErrorsCompiler, unionErrVarname: string, index) {
        // TODO: should work the same as getChildIsTypeStrict but callingJitErr if there is an error
        const ItemErrVarName = `${unionErrVarname}[${index}]`;
        const originalErrArg = comp.args.εrr;
        (comp.args as JitFnArgs).εrr = ItemErrVarName; // use variable for union errors
        const typeErrsCode = childRt.compileTypeErrors(comp);
        // console.log('typeErrsCode', typeErrsCode);
        const hash = toLiteral(childRt.getJitHash(comp.opts));
        const itemCode = `${comp.args.pλth}.push(${hash});${typeErrsCode};${comp.args.pλth}.pop()`;
        (comp.args as JitFnArgs).εrr = originalErrArg;
        const isTypeWithProperties =
            isInterfaceRunType(childRt) ||
            isClassRunType(childRt) ||
            isObjectLiteralRunType(childRt) ||
            isIntersectionRunType(childRt);
        if (!isTypeWithProperties || childRt.getFamily() !== 'C') return itemCode;
        else {
            const props = childRt.getJitChildren(comp);
            const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
            if (hasIndexProperty) return itemCode;
            const hasUnknownKeysOptsVarName = `uKOpts${this.getNestLevel()}`;
            const checkPropName = JitFunctions.hasUnknownKeys.runTimeOptions.checkNonJitProps.keyName;
            comp.setContextItem(hasUnknownKeysOptsVarName, `const ${hasUnknownKeysOptsVarName} = {${checkPropName}: true}`);
            // forces to call hasUnknownKeys with hasUnknownKeysOptsVarName options
            comp.setChildrenCallArgs(JitFunctions.hasUnknownKeys.id, {θpts: hasUnknownKeysOptsVarName});
            const codeHasUnknown = childRt.compileHasUnknownKeys(comp);
            if (!codeHasUnknown) return itemCode;
            const getUnknownKeysCode = childRt.compileUnknownKeyErrors(comp);
            // TODO: finish this scenario
            return `${getUnknownKeysCode}`;
        }
    }

    _compileTypeErrorsOld(comp: JitErrorsCompiler): jitCode {
        const isType = this.compileIsType(comp);
        const code = `if (!${isType}) ${comp.callJitErr(this)};`;
        return code;
    }

    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const unionErrVarname = `uErr${this.getNestLevel()}`;
        const parsedErrorsVarName = `upErr${this.getNestLevel()}`;
        const originalErrArg = comp.args.εrr;
        (comp.args as JitFnArgs).εrr = unionErrVarname; // use variable for union errors
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        let index = 0;
        const items = simpleItems.map((rt) => this.getChildTypeErrorsStrict(rt, comp, unionErrVarname, index++));
        const simpleItemsErrorsCode = items.filter(Boolean).join(';');
        let unionItemsCode: string;
        if (!objectTypes.length) unionItemsCode = simpleItemsErrorsCode;
        else {
            const objItemsCode = objectTypes.map((rt) => this.getChildTypeErrorsStrict(rt, comp, unionErrVarname, index++));
            const objCode = objItemsCode.filter(Boolean).join(';');
            const objectItemsErrorsCode = `if (typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null) {${objCode}} else {${comp.callJitErr(this)};}`;
            unionItemsCode = [simpleItemsErrorsCode, objectItemsErrorsCode].filter(Boolean).join(';');
        }
        (comp.args as JitFnArgs).εrr = originalErrArg;
        const initUnionErrors = `const ${unionErrVarname} = Array.from(Array(${index}),() => [])`;
        const getUnionErrCode = `if (${unionErrVarname}.every((err) => err.length !== 0)) {const ${parsedErrorsVarName} = utl.getUnionErrors(${unionErrVarname});if (${parsedErrorsVarName}.length) ${originalErrArg}.push(...${parsedErrorsVarName})}`;
        return [initUnionErrors, unionItemsCode, getUnionErrCode].filter(Boolean).join(';');
    }

    /**
     * When a union is encodes to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const errName = `uErr${this.getNestLevel()}`;
        const fail = `throw new Error(${errName});`;
        comp.setContextItem(errName, `const ${errName} = "Can not json encode union: item does not belong to the union"`);

        const ifElse = createIfElseFn();
        const onUnionItems = (items: BaseRunType[]) => {
            const result = items.map((unionItem) => {
                const childCode = unionItem.compileToJsonVal(comp) || '';
                // TODO: calling full decode could be expensive and we calling it only to know if it needs encoding.
                // we might want to optimize this, call to decode is also being added to the context and should be removed
                const decCode = unionItem.compileFromJsonVal(comp);
                const needsTupleEncoding = !!childCode || !!decCode;
                const isExpression = childIsExpression(JitFunctions.toJsonVal.id, unionItem);
                const encodeCode = isExpression && childCode ? `${comp.vλl} = ${childCode};` : childCode;
                // item encoded before reassigning varName to [i, item]
                const index = this.getUnionItemIndex(comp, unionItem);
                const tupleEncode = needsTupleEncoding ? `${comp.vλl} = [${index}, ${comp.vλl}]` : '/*noop*/';
                const isTypeCode = this.getChildIsTypeStrict(unionItem, comp);
                return `${ifElse()} (${isTypeCode}) {${encodeCode} ${tupleEncode}}`;
            });
            return result.filter(Boolean);
        };

        const itemsCode = onUnionItems(simpleItems);
        if (!objectTypes.length) return `${itemsCode.join('')} else {${fail}}`;
        // these need to be in correct order for else if to work properly
        const nonObjectFail = `${ifElse()} (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) {${fail}}`;
        const objItemsCode = onUnionItems(objectTypes);
        const allFail = `${ifElse(true)} {${fail}}`;
        return [...itemsCode, nonObjectFail, ...objItemsCode, allFail].join('');
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const decVar = `dεc${this.getNestLevel()}`;
        const errVarName = `uErr${this.getNestLevel()}`;
        comp.setContextItem(errVarName, `const ${errVarName} = "Can not json decode union: invalid union index"`);
        const children = this.getJitChildren(comp);
        const ifElse = createIfElseFn();
        const itemsCode = children
            .map((unionItem) => {
                const childCode = unionItem.compileFromJsonVal(comp) || '';
                const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, unionItem);
                const code = isExpression && childCode && childCode !== comp.vλl ? `${comp.vλl} = ${childCode}` : childCode;
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
        return code;
    }

    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getTypeName())
            .join(' | ');
    }
}
