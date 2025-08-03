/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeArray} from '@deepkit/type';
import type {jitCode, JitFnID} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {CodeType} from '../../constants.functions';
import {JitFunctions} from '../../constants.functions';

export class ArrayRunType<T extends Type = TypeArray> extends MemberRunType<T> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startIndex(comp: JitCompiler): number {
        return 0;
    }
    getChildVarName(comp: JitCompiler): string {
        return `i${comp.getNestLevel(this)}`;
    }
    getChildLiteral(comp: JitCompiler): string {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): true {
        return true;
    }
    isOptional(): boolean {
        return false;
    }
    // ArrayRunType uses 'RB' (return block) code type for certain operations
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);
        const memberCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!memberCode) {
            return {
                code: `Array.isArray(${comp.vλl})`,
                codeType: 'E',
                skipJit: false
            };
        }
        return {
            code: `
                if (!Array.isArray(${comp.vλl})) return false;
                for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${resultVal} = ${memberCode.code};
                    if (!(${resultVal})) return false;
                }
                return true;
            `,
            codeType: 'RB',
            skipJit: false,
            children: [memberCode]
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const index = this.getChildVarName(comp);
        const memberCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!memberCode) {
            return {
                code: `if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};`,
                codeType: 'S',
                skipJit: false
            };
        }
        return {
            code: `
                if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};
                else {for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode.code}}}
            `,
            codeType: 'S',
            skipJit: false,
            children: [memberCode]
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileHasUnknownKeys(comp);
        if (!memberCode) return undefined;
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);

        return {
            code: `
                if (!Array.isArray(${comp.vλl})) return false;
                for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                    const ${resultVal} = ${memberCode.code};
                    if (${resultVal}) return true;
                }
                return false;
            `,
            codeType: 'RB',
            skipJit: false,
            children: [memberCode]
        };
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }

    traverseCode(comp: JitCompiler, memberCode: jitCode): jitCode {
        if (!memberCode) return undefined;
        const index = this.getChildVarName(comp);
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode.code}}`,
            codeType: 'S',
            skipJit: false,
            children: [memberCode]
        };
    }
}
