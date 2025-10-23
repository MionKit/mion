import {ReflectionKind, TypeIndexSignature} from '@deepkit/type';
import {MemberRunType} from '../../lib/baseRunTypes';
import {type JitCode} from '../../types';
import {JitFunctions} from '../../constants.functions';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {InterfaceRunType} from '../collection/interface';
import {childIsExpression} from '../../lib/utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends MemberRunType<TypeIndexSignature> {
    isOptional(): boolean {
        return true;
    }
    getChildVarName(comp: JitFnCompiler): string {
        return `p${comp.getNestLevel(this)}`;
    }
    getChildLiteral(comp: JitFnCompiler): string {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): true {
        return true;
    }
    skipJit(comp: JitFnCompiler): boolean {
        const index = (this.src as TypeIndexSignature).index?.kind;
        if (index === ReflectionKind.symbol) {
            return comp?.fnID !== JitFunctions.toJavascript.id;
        }
        return false;
    }

    // #### jit code ####
    emitIsType(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        return {
            code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}){if (!(${childJit.code})) return false;} return true;`,
            type: 'RB',
        };
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        if (!childJit?.code) return {code: undefined, type: 'S'};
        return {code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}) {${childJit.code}}`, type: 'S'};
    }
    emitToJsonVal(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileToJsonVal(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`, type: 'S'};
    }
    emitFromJsonVal(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileFromJsonVal(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`, type: 'S'};
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'E'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileHasUnknownKeys(child, 'E');
        if (!childJit?.code) return {code: '', type: 'E'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        return {
            code: `for (const ${prop} in ${varName}) {const ${resultVal} = ${childJit.code};if (${resultVal}) return true;}return false;`,
            type: 'RB',
        };
    }
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeyErrors(child, 'S');
        return this.traverseCode(comp, childJit);
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileStripUnknownKeys(child, 'S');
        return this.traverseCode(comp, childJit);
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeysToUndefined(child, 'S');
        return this.traverseCode(comp, childJit);
    }
    traverseCode(comp: JitFnCompiler, childJit: JitCode | undefined): JitCode {
        if (!childJit?.code) return {code: undefined, type: 'S'};
        const prop = this.getChildVarName(comp);
        return {code: `for (const ${prop} in ${comp.vλl}) {${childJit.code}}`, type: 'S'};
    }
    /**
     * if index property should be skipped then it output some code to skip it,
     * this happen when an object/interface has an index property but also has named properties
     * that might collide with the index property. ie {[key: string]: string, a: string}
     * when executing the logic for the index property we need to skip the named properties.
     */
    getSkipCode(comp: JitFnCompiler, prop: string): string {
        const parent = this.getParent() as InterfaceRunType;
        const namedChildren = parent.getNamedChildren(comp);
        const skipNames = namedChildren.length
            ? namedChildren.map((child) => `${child.getChildLiteral(comp)} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }
}
