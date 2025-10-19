/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeArray} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';

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

    // #### jit code ####
    _compileIsType(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);
        const childJit = this.getJitChild(comp)?.compileIsType(comp, 'E');
        if (!childJit?.code) return {code: `Array.isArray(${comp.vλl})`, type: 'E'};
        return {
            code: `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${childJit.code};
                if (!(${resultVal})) return false;
            }
            return true;
        `,
            type: 'RB',
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const childJit = this.getJitChild(comp)?.compileTypeErrors(comp, 'S');
        if (!childJit?.code) return {code: `if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};`, type: 'S'};
        return {
            code: `
            if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};
            else {for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${childJit.code}}}
        `,
            type: 'S',
        };
    }
    _compileToJsonVal(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = child?.compileToJsonVal(comp, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            type: 'S',
        };
    }
    _compileFromJsonVal(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = child?.compileFromJsonVal(comp, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            type: 'S',
        };
    }
    _compileHasUnknownKeys(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'E'};
        const childJit = this.getJitChild(comp)?.compileHasUnknownKeys(comp, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);

        return {
            code: `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${childJit.code};
                if (${resultVal}) return true;
            }
            return false;
        `,
            type: 'RB',
        };
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const childJit = this.getJitChild(comp)?.compileUnknownKeyErrors(comp, 'S');
        return this.traverseCode(comp, childJit);
    }
    _compileStripUnknownKeys(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const childJit = this.getJitChild(comp)?.compileStripUnknownKeys(comp, 'S');
        return this.traverseCode(comp, childJit);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const childJit = this.getJitChild(comp)?.compileUnknownKeysToUndefined(comp, 'S');
        return this.traverseCode(comp, childJit);
    }

    traverseCode(comp: JitCompiler, childJit: JitCode | undefined): {code: string | undefined; type: 'S'} {
        if (!childJit?.code) return {code: undefined, type: 'S'};
        const index = this.getChildVarName(comp);
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${childJit.code}}`,
            type: 'S',
        };
    }

    checkNonSkipTypes(comp: JitCompiler) {
        const child = this.getMemberType();
        if (child.skipJit(comp)) throw new Error(`Arrays can not have non serializable types, ie: Symbol[], Function[], etc.`);
    }
}
