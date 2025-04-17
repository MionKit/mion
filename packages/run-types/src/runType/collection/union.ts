/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeUnion} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitFnID, jitCode} from '../../types';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {CodeType, JitFunctions} from '../../constants';
import {isClassRunType, isInterfaceRunType, isIntersectionRunType, isObjectLiteralRunType} from '../../lib/guards';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends CollectionRunType<TypeUnion> {
    getCodeType(fnId: JitFnID): CodeType {
        switch (fnId) {
            case JitFunctions.jsonStringify.id:
            case JitFunctions.toCode.id:
                return 'RB';
            default:
                return super.getCodeType(fnId);
        }
    }
    getChildStrictIsType(rt: BaseRunType, comp: JitCompiler) {
        const isTypeCode = rt.compileIsType(comp);
        const isTypeWithProperties =
            isInterfaceRunType(rt) || isClassRunType(rt) || isObjectLiteralRunType(rt) || isIntersectionRunType(rt);
        if (!isTypeWithProperties) return isTypeCode;
        const codeHasUnknown = rt.compileHasUnknownKeys(comp);
        return codeHasUnknown ? `(${isTypeCode} && !${codeHasUnknown})` : `${isTypeCode}`;
    }

    // #### collection's jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        // TODO: enforce strictTypes to ensure no extra properties of the union go unchecked
        const children = this.getJitChildren(comp);
        const code = children.map((rt) => this.getChildStrictIsType(rt, comp)).join(' || ');
        return `(${code})`;
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
        // TODO: enforce strictTypes to ensure no extra properties of the union go unchecked
        const childrenCode = this.getJitChildren(comp)
            .map((child, i) => {
                const iF = i === 0 ? 'if' : 'else if';
                const childCode = child.compileToJsonVal(comp) || '';
                const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
                const encodeCode = isExpression && childCode ? `${comp.vλl} = ${childCode};` : childCode;
                const itemIsType = this.getChildStrictIsType(child, comp);
                // item encoded before reassigning varName to [i, item]
                return `${iF} (${itemIsType}) {${encodeCode} ${comp.vλl} = [${i}, ${comp.vλl}]}`;
            })
            .filter(Boolean)
            .join('');
        const code = `
            ${childrenCode}
            else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${comp.vλl}?.constructor?.name || typeof ${comp.vλl}) }
        `;

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
        const childrenCode = children
            .map((child, i) => {
                const iF = i === 0 ? 'if' : 'else if';
                const childCode = child.compileFromJsonVal(comp) || '';
                const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
                const code = isExpression && childCode && childCode !== comp.vλl ? `${comp.vλl} = ${childCode}` : childCode;
                // item is decoded before being extracted from the array
                return `${iF} ( ${decVar} === ${i}) {${comp.vλl} = ${comp.vλl}[1];${code}}`;
            })
            .filter(Boolean)
            .join('');
        const code = `
                const ${decVar} = ${comp.vλl}[0];
                ${childrenCode}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${comp.vλl}?.constructor?.name || typeof ${comp.vλl}) }            `;
        return code;
    }
    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getKindName())
            .join(' | ');
    }
}
