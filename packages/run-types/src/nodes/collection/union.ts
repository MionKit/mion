/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUnion} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';
import {childIsExpression, createIfElseFn, toLiteral} from '../../lib/utils';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';
import {markDiscriminators, splitUnionItems} from './unionDiscriminator';
import type {PropertyRunType} from '../member/property';

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

    getUnionChildren(comp: JitFnCompiler) {
        const children = this.getJitChildren(comp);
        markDiscriminators(comp, this, children);
        return splitUnionItems(comp, this, children);
    }

    getUnionItemIndex(comp: JitFnCompiler, unionItem: BaseRunType): number {
        const children = this.getJitChildren(comp);
        const index = children.findIndex((child) => child === unionItem);
        if (index === -1) throw new Error(`Item ${unionItem.getTypeName()} not found in union ${this.getTypeName()}`);
        return index;
    }

    /**
     * Unlike typescript unions can not have properties from two types,
     * this is because at runtime we need to identify the original object in the union.
     * This allows objects to have extra properties (like methods) as long as they don't have
     * properties that belong to other union members, enabling unambiguous type identification.
     * @see union.spec.ts 'Union Obj' and 'Union Mixed' test suites for examples.
     */
    getChildIsTypeWithForbiddenProps(rt: BaseRunType, comp: JitFnCompiler): string {
        const isTypeCode = comp.compileIsType(rt, 'E').code || '';
        const isTypeWithProperties =
            isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt);
        if (!isTypeWithProperties || rt.getFamily() !== 'C') return isTypeCode;
        const props = rt.getJitChildren(comp);
        const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return isTypeCode;
        // Get all object types in the union
        const {objectTypes} = this.getUnionChildren(comp);
        const isAllOptional = rt.areAllChildrenOptional(props);
        // If there are no other object types, no need to check forbidden props
        if (objectTypes.length === 1 && !isAllOptional) return isTypeCode;
        // Get property names of this type
        const thisTypeProps = new Set<string | number>();
        for (const prop of props) {
            const name = (prop as PropertyRunType).getPropertyName();
            thisTypeProps.add(name);
        }
        // Collect property names from OTHER object types that are NOT in this type
        const forbiddenPropNames = new Set<string | number>();
        for (const otherRt of objectTypes) {
            if (otherRt === rt) continue;
            const otherProps = otherRt.getJitChildren(comp);
            // If any other type has an index signature, fall back to strict checking
            const otherHasIndex = otherProps.some((p) => p.src.kind === ReflectionKind.indexSignature);
            if (otherHasIndex) continue;
            for (const prop of otherProps) {
                const name = (prop as PropertyRunType).getPropertyName();
                if (name !== undefined && !thisTypeProps.has(name)) {
                    forbiddenPropNames.add(name);
                }
            }
        }
        // For all-optional types (weak types), TypeScript requires at least one matching property
        // or an empty object. This prevents {c: 'hello'} from matching {a?: string; b?: string}
        let weakTypeCheck = '';
        if (isAllOptional && props.length > 0) {
            // Must have at least one of this type's own props OR be empty
            const hasOwnPropCheck = props.map((p) => {
                const name = (p as PropertyRunType).getPropertyName();
                return `(${toLiteral(name)} in ${comp.vλl})`;
            });
            hasOwnPropCheck.push(`Object.keys(${comp.vλl}).length === 0`);
            weakTypeCheck = `(${hasOwnPropCheck.join(' || ')})`;
        }
        if (forbiddenPropNames.size === 0 && !weakTypeCheck) return isTypeCode;
        // Generate code to check that none of the forbidden props exist
        const checks: string[] = [isTypeCode];
        if (forbiddenPropNames.size > 0) {
            const forbiddenCheck = Array.from(forbiddenPropNames)
                .map((p) => `!(${toLiteral(p)} in ${comp.vλl})`)
                .join(' && ');
            checks.push(forbiddenCheck);
        }
        if (weakTypeCheck) checks.push(weakTypeCheck);
        return `(${checks.join(' && ')})`;
    }

    /**
     * Uses forbidden props approach: Only check for properties from OTHER union types.
     * This allows objects to have extra properties (like methods) as long as they don't have
     * properties that belong to other union members, enabling unambiguous type identification.
     */
    emitIsType(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const items = simpleItems.map((rt) => this.getChildIsTypeWithForbiddenProps(rt, comp));
        const checkItems = items.filter(Boolean).join(' || ');
        if (!objectTypes.length) return {code: `(${checkItems})`, type: 'E'};
        const objItems = objectTypes.map((rt) => this.getChildIsTypeWithForbiddenProps(rt, comp));
        const objCode = objItems.filter(Boolean).join(' || ');
        const checkObjs = `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && (${objCode}))`;
        return {code: `(${[checkItems, checkObjs].filter(Boolean).join(' || ')})`, type: 'E'};
    }

    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
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
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const {simpleItems, objectTypes} = this.getUnionChildren(comp);
        const errName = comp.getLocalVarName('uErr', this);
        const fail = `throw new Error(${errName});`;
        comp.setContextItem(errName, `const ${errName} = "Can not json encode union: item does not belong to the union"`);

        const ifElse = createIfElseFn();
        const onUnionItems = (items: BaseRunType[]) => {
            const result = items.map((childRt) => {
                const toJit = comp.compilePrepareForJson(childRt, 'S');
                // TODO: calling full decode could be expensive and we calling it only to know if it needs encoding.
                // we might want to optimize this, call to decode is also being added to the context and should be removed
                const fromJit = comp.compileRestoreFromJson(childRt, 'S');
                const needsTupleEncoding = !!toJit.code || !!fromJit.code;
                const isExpression = childIsExpression(toJit, childRt);
                const encodeCode = isExpression && toJit.code ? `${comp.vλl} = ${toJit.code};` : toJit.code || '';
                // item encoded before reassigning varName to [i, item]
                const index = this.getUnionItemIndex(comp, childRt);
                const tupleEncode = needsTupleEncoding ? `${comp.vλl} = [${index}, ${comp.vλl}]` : '/*noop*/';
                const isTypeCode = this.getChildIsTypeWithForbiddenProps(childRt, comp);
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
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const decVar = comp.getLocalVarName('dec', this);
        const errVarName = comp.getLocalVarName('uErr', this);
        comp.setContextItem(errVarName, `const ${errVarName} = "Can not json decode union: invalid union index"`);
        const children = this.getJitChildren(comp);
        const ifElse = createIfElseFn();
        const itemsCode = children
            .map((unionItem) => {
                const childJit = comp.compileRestoreFromJson(unionItem, 'S');
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

    checkNonSkipTypes(comp: JitFnCompiler) {
        const allChildren = this.getChildRunTypes();
        const toSkip = allChildren.filter((rt) => rt.skipJit(comp));
        if (toSkip.length) throw new Error(`Union can not have non serializable types, ie: Symbol, Function, etc.`);
    }
}
