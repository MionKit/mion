/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUnion} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {JitCode} from '../../types.ts';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes.ts';
import {childIsExpression, createIfElseFn, toLiteral} from '../../lib/utils.ts';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards.ts';
import {markDiscriminators, splitUnionItems, SplitUnionResult} from './unionDiscriminator.ts';
import type {PropertyRunType} from '../member/property.ts';

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

    getUnionChildren(comp: JitFnCompiler): SplitUnionResult {
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
     * Returns isType check for a union child with loose matching.
     * Uses first-match strategy: returns first matching type in declaration order.
     * For all-optional types (weak types), ensures at least one property matches or is empty object.
     * Note: Use ESLint rules @mionjs/no-unreachable-union-types and @mionjs/no-mixed-union-properties
     * to detect overlapping union types at compile time.
     * @see union.spec.ts 'Union Obj' and 'Union Mixed' test suites for examples.
     */
    getChildIsTypeWithLooseCheck(rt: BaseRunType, comp: JitFnCompiler): string {
        const isTypeCode = comp.compileIsType(rt, 'E').code || '';
        const isTypeWithProperties =
            isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt);
        if (!isTypeWithProperties || rt.getFamily() !== 'C') return isTypeCode;
        const props = rt.getJitChildren(comp);
        const hasIndexProperty = props.some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return isTypeCode;
        const isAllOptional = rt.areAllChildrenOptional(props);
        // For all-optional types (weak types), TypeScript requires at least one matching property
        // or an empty object. This prevents {c: 'hello'} from matching {a?: string; b?: string}
        if (isAllOptional && props.length > 0) {
            // Must have at least one of this type's own props OR be empty
            const hasOwnPropCheck = props.map((p) => {
                const name = (p as PropertyRunType).getPropertyName();
                return `(${toLiteral(name)} in ${comp.vλl})`;
            });
            hasOwnPropCheck.push(`Object.keys(${comp.vλl}).length === 0`);
            const weakTypeCheck = `(${hasOwnPropCheck.join(' || ')})`;
            return `(${isTypeCode} && ${weakTypeCheck})`;
        }
        return isTypeCode;
    }

    /**
     * Loose union matching: returns first matching type in declaration order.
     * Objects with properties from multiple union types will match the first compatible type.
     * Use ESLint rules to detect overlapping types at compile time.
     */
    emitIsType(comp: JitFnCompiler): JitCode {
        this.checkAllowedChildren(comp);
        const {simpleItems, objectTypes, anyItem} = this.getUnionChildren(comp);
        // Simple items (atomic types) don't need null guard
        const simpleChecks = simpleItems.map((rt) => this.getChildIsTypeWithLooseCheck(rt, comp)).filter(Boolean);
        // Object types need null guard to prevent accessing properties on null
        const objChecks = objectTypes.map((rt) => this.getChildIsTypeWithLooseCheck(rt, comp)).filter(Boolean);
        const objCode = objChecks.length
            ? `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && (${objChecks.join(' || ')}))`
            : '';
        // any/unknown checked last as fallback
        const anyCheck = anyItem ? this.getChildIsTypeWithLooseCheck(anyItem, comp) : '';
        const allChecks = [...simpleChecks, objCode, anyCheck].filter(Boolean);
        return {code: `(${allChecks.join(' || ')})`, type: 'E'};
    }

    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        this.checkAllowedChildren(comp);
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
        this.checkAllowedChildren(comp);
        const {simpleItems, objectTypes, anyItem} = this.getUnionChildren(comp);
        const errName = comp.getLocalVarName('uErr', this);
        const fail = `throw new Error(${errName});`;
        comp.setContextItem(errName, `const ${errName} = "Can not json encode union: item does not belong to the union"`);

        const ifElse = createIfElseFn();

        // Helper to generate encode code for a union item
        const getEncodeCode = (childRt: BaseRunType) => {
            const toJit = comp.compilePrepareForJson(childRt, 'S');
            const fromJit = comp.compileRestoreFromJson(childRt, 'S');
            const needsTupleEncoding = !!toJit.code || !!fromJit.code;
            const isExpression = childIsExpression(toJit, childRt);
            const encodeCode = isExpression && toJit.code ? `${comp.vλl} = ${toJit.code};` : toJit.code || '';
            const index = this.getUnionItemIndex(comp, childRt);
            const tupleEncode = needsTupleEncoding ? `${comp.vλl} = [${index}, ${comp.vλl}]` : '/*noop*/';
            return `${encodeCode} ${tupleEncode}`;
        };

        // Generate code for simple items (atomic types)
        const simpleCode = simpleItems.map((rt) => {
            const isTypeCode = this.getChildIsTypeWithLooseCheck(rt, comp);
            return `${ifElse()} (${isTypeCode}) {${getEncodeCode(rt)}}`;
        });

        // Generate code for object types (need null guard)
        const objCode = objectTypes.length
            ? objectTypes.map((rt) => {
                  const isTypeCode = this.getChildIsTypeWithLooseCheck(rt, comp);
                  return `${ifElse()} (typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && ${isTypeCode}) {${getEncodeCode(rt)}}`;
              })
            : [];

        // Generate code for anyItem (always matches, checked last as fallback)
        const anyCode = anyItem ? `${ifElse(true)} {${getEncodeCode(anyItem)}}` : `${ifElse(true)} {${fail}}`;

        return {code: [...simpleCode, ...objCode, anyCode].join(''), type: 'S'};
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        this.checkAllowedChildren(comp);
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

    checkAllowedChildren(comp: JitFnCompiler) {
        const allChildren = this.getChildRunTypes();
        const toSkip = allChildren.filter((rt) => rt.skipJit(comp));
        if (toSkip.length)
            throw new Error(`Union can not have non serializable types, ie: Symbol, Function, etc. \nType: ${this.stringify()}`);
    }
}
