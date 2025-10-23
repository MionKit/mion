/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeArray} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';

export class ArrayRunType<T extends Type = TypeArray> extends MemberRunType<T> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startIndex(comp: JitFnCompiler): number {
        return 0;
    }
    getChildVarName(comp: JitFnCompiler): string {
        return `i${comp.getNestLevel(this)}`;
    }
    getChildLiteral(comp: JitFnCompiler): string {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): true {
        return true;
    }
    isOptional(): boolean {
        return false;
    }

    // #### jit code ####
    emitIsType(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
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
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        if (!childJit?.code) return {code: `if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};`, type: 'S'};
        return {
            code: `
            if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};
            else {for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${childJit.code}}}
        `,
            type: 'S',
        };
    }
    emitToJsonVal(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileToJsonVal(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            type: 'S',
        };
    }
    emitFromJsonVal(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileFromJsonVal(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`,
            type: 'S',
        };
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'E'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileHasUnknownKeys(child, 'E');
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
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeyErrors(child, 'S');
        return this.traverseCode(comp, childJit);
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileStripUnknownKeys(child, 'S');
        return this.traverseCode(comp, childJit);
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return {code: '', type: 'E'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeysToUndefined(child, 'S');
        return this.traverseCode(comp, childJit);
    }

    traverseCode(comp: JitFnCompiler, childJit: JitCode | undefined): {code: string | undefined; type: 'S'} {
        if (!childJit?.code) return {code: undefined, type: 'S'};
        const index = this.getChildVarName(comp);
        return {
            code: `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${childJit.code}}`,
            type: 'S',
        };
    }

    checkNonSkipTypes(comp: JitFnCompiler) {
        const child = this.getMemberType();
        if (child.skipJit(comp)) throw new Error(`Arrays can not have non serializable types, ie: Symbol[], Function[], etc.`);
    }
}
