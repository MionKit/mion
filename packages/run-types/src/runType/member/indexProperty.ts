import {ReflectionKind, TypeIndexSignature} from '@deepkit/type';
import {MemberRunType} from '../../lib/baseRunTypes';
import {type JitCode} from '../../types';
import {JitFunctions} from '../../constants.functions';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
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
    getChildVarName(comp: JitCompiler): string {
        return `p${comp.getNestLevel(this)}`;
    }
    getChildLiteral(comp: JitCompiler): string {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): true {
        return true;
    }
    skipJit(comp: JitCompiler): boolean {
        const index = (this.src as TypeIndexSignature).index?.kind;
        if (index === ReflectionKind.symbol) {
            return comp?.fnID !== JitFunctions.toJavascript.id;
        }
        return false;
    }

    // #### jit code ####
    _compileIsType(comp: JitCompiler): JitCode {
        const childJit = this.getJitChild(comp)?.compileIsType(comp, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        return {
            code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}){if (!(${childJit.code})) return false;} return true;`,
            type: 'RB',
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): JitCode {
        const childJit = this.getJitChild(comp)?.compileTypeErrors(comp, 'S');
        if (!childJit?.code) return {code: undefined, type: 'S'};
        return {code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}) {${childJit.code}}`, type: 'S'};
    }
    _compileToJsonVal(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = child?.compileToJsonVal(comp, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`, type: 'S'};
    }
    _compileFromJsonVal(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = child?.compileFromJsonVal(comp, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`, type: 'S'};
    }
    _compileHasUnknownKeys(comp: JitCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'E'};
        const childJit = this.getJitChild(comp)?.compileHasUnknownKeys(comp, 'E');
        if (!childJit?.code) return {code: '', type: 'E'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        return {
            code: `for (const ${prop} in ${varName}) {const ${resultVal} = ${childJit.code};if (${resultVal}) return true;}return false;`,
            type: 'RB',
        };
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const childJit = this.getJitChild(comp)?.compileUnknownKeyErrors(comp, 'S');
        return this.traverseCode(comp, childJit);
    }
    _compileStripUnknownKeys(comp: JitCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const childJit = this.getJitChild(comp)?.compileStripUnknownKeys(comp, 'S');
        return this.traverseCode(comp, childJit);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): JitCode {
        if (this.getMemberType().getFamily() === 'A') return {code: undefined, type: 'S'};
        const childJit = this.getJitChild(comp)?.compileUnknownKeysToUndefined(comp, 'S');
        return this.traverseCode(comp, childJit);
    }
    traverseCode(comp: JitCompiler, childJit: JitCode | undefined): JitCode {
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
    getSkipCode(comp: JitCompiler, prop: string): string {
        const parent = this.getParent() as InterfaceRunType;
        const namedChildren = parent.getNamedChildren(comp);
        const skipNames = namedChildren.length
            ? namedChildren.map((child) => `${child.getChildLiteral(comp)} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }
}
