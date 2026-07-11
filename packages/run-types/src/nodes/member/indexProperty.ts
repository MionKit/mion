import {ReflectionKind, type TypeIndexSignature, type TypeTemplateLiteral} from '@deepkit/type';
import {MemberRunType} from '../../lib/baseRunTypes.ts';
import {type JitCode} from '../../types.ts';
import {JitFunctions} from '../../constants.functions.ts';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import {InterfaceRunType} from '../collection/interface.ts';
import {childIsExpression} from '../../lib/utils.ts';
import {buildAnchoredTemplateRegexSource} from '../collection/templateLiteral.ts';

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
        return comp.getLocalVarName('p', this);
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
            return comp?.fnID !== JitFunctions.toJSCode.id;
        }
        return false;
    }

    /** if the index key is a template literal type, return the JIT context var holding the compiled key-pattern regex */
    private getKeyPatternVar(comp: JitFnCompiler): string | undefined {
        const idx = this.src.index;
        if (idx?.kind !== ReflectionKind.templateLiteral) return undefined;
        const varName = comp.getLocalVarName('reIdx', this);
        if (!comp.hasContextItem(varName)) {
            const src = buildAnchoredTemplateRegexSource((idx as TypeTemplateLiteral).types || []);
            comp.setContextItem(varName, `const ${varName} = new RegExp(${JSON.stringify(src)})`);
        }
        return varName;
    }

    // #### jit code ####
    emitIsType(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
        const prop = this.getChildVarName(comp);
        const reVar = this.getKeyPatternVar(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const keyCheck = reVar ? `if (!${reVar}.test(${prop})) return false;` : '';
        if (!childJit?.code && !keyCheck) return {code: undefined, type: 'E'};
        const valueCheck = childJit?.code ? `if (!(${childJit.code})) return false;` : '';
        return {
            code: `for (const ${prop} in ${comp.vλl}){${skipCode} ${keyCheck} ${valueCheck}} return true;`,
            type: 'RB',
        };
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        const prop = this.getChildVarName(comp);
        const reVar = this.getKeyPatternVar(comp);
        const skipCode = this.getSkipCode(comp, prop);
        // when the key fails the template literal pattern, report it (with the offending key in the path)
        // and skip the value check to avoid compounding errors on values whose key was already invalid
        const keyErr = reVar ? `if (!${reVar}.test(${prop})) {${comp.callJitErrWithPath(this, prop)}; continue;}` : '';
        if (!childJit?.code && !keyErr) return {code: undefined, type: 'S'};
        return {code: `for (const ${prop} in ${comp.vλl}) {${skipCode} ${keyErr} ${childJit?.code || ''}}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compilePrepareForJson(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const reVar = this.getKeyPatternVar(comp);
        const patternSkip = reVar ? `if (!${reVar}.test(${prop})) continue;` : '';
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${patternSkip} ${code}}`, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileRestoreFromJson(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const reVar = this.getKeyPatternVar(comp);
        const patternSkip = reVar ? `if (!${reVar}.test(${prop})) continue;` : '';
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return {code: `for (const ${prop} in ${varName}){${skipCode} ${patternSkip} ${code}}`, type: 'S'};
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        const reVar = this.getKeyPatternVar(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileHasUnknownKeys(child, 'E');
        // when the value is atomic and there's no key pattern, every key is "known" -> no check needed
        if (this.getMemberType().getFamily() === 'A' && !reVar) return {code: undefined, type: 'E'};
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const patternCheck = reVar ? `if (!${reVar}.test(${prop})) return true;` : '';
        const childCheck = childJit?.code
            ? `const ${comp.getLocalVarName('res', this)} = ${childJit.code};if (${comp.getLocalVarName('res', this)}) return true;`
            : '';
        if (!patternCheck && !childCheck) return {code: '', type: 'E'};
        return {
            code: `for (const ${prop} in ${varName}) {${skipCode} ${patternCheck} ${childCheck}}return false;`,
            type: 'RB',
        };
    }
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        const reVar = this.getKeyPatternVar(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeyErrors(child, 'S');
        if (this.getMemberType().getFamily() === 'A' && !reVar) return {code: undefined, type: 'S'};
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const patternErr = reVar ? `if (!${reVar}.test(${prop})) {${comp.callJitErrWithPath('never', prop)}; continue;}` : '';
        if (!patternErr && !childJit?.code) return {code: undefined, type: 'S'};
        return {code: `for (const ${prop} in ${comp.vλl}) {${skipCode} ${patternErr} ${childJit?.code || ''}}`, type: 'S'};
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        const reVar = this.getKeyPatternVar(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileStripUnknownKeys(child, 'S');
        if (this.getMemberType().getFamily() === 'A' && !reVar) return {code: undefined, type: 'S'};
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const patternStrip = reVar ? `if (!${reVar}.test(${prop})) {delete ${comp.vλl}[${prop}]; continue;}` : '';
        if (!patternStrip && !childJit?.code) return {code: undefined, type: 'S'};
        return {code: `for (const ${prop} in ${comp.vλl}) {${skipCode} ${patternStrip} ${childJit?.code || ''}}`, type: 'S'};
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        const reVar = this.getKeyPatternVar(comp);
        const child = this.getJitChild(comp);
        const childJit = comp.compileUnknownKeysToUndefined(child, 'S');
        if (this.getMemberType().getFamily() === 'A' && !reVar) return {code: undefined, type: 'S'};
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);
        const patternUndef = reVar ? `if (!${reVar}.test(${prop})) {${comp.vλl}[${prop}] = undefined; continue;}` : '';
        if (!patternUndef && !childJit?.code) return {code: undefined, type: 'S'};
        return {code: `for (const ${prop} in ${comp.vλl}) {${skipCode} ${patternUndef} ${childJit?.code || ''}}`, type: 'S'};
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
