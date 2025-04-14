import {ReflectionKind, TypeIndexSignature} from '@deepkit/type';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {JitConfig, JitFnID, Mutable, type jitCode} from '../../types';
import {CodeType, JitFunctions} from '../../constants';
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
        return false;
    }
    getChildVarName(): string {
        return `p${this.getNestLevel()}`;
    }
    getChildLiteral(): string {
        return this.getChildVarName();
    }
    useArrayAccessor(): true {
        return true;
    }
    getJitConfig(stack: BaseRunType[] = []): JitConfig {
        const jc = super.getJitConfig(stack) as Mutable<JitConfig>;
        const index = (this.src as TypeIndexSignature).index?.kind || undefined;
        if (index === ReflectionKind.symbol) {
            jc.skipJit = true;
        }
        return jc;
    }
    getCodeType(fnId: JitFnID): CodeType {
        switch (fnId) {
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.hasUnknownKeys.id:
                return 'RB';
            default:
                return super.getCodeType(fnId);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const childCode = this.getJitChild()?.compileIsType(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}){if (!(${childCode})) return false;} return true;`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const childCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}) {${childCode}}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild();
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);

        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild();
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);

        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!memberCode) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const resultVal = `res${this.getNestLevel()}`;
        return `for (const ${prop} in ${varName}) {const ${resultVal} = ${memberCode};if (${resultVal}) return true;}return false;`;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }
    traverseCode(comp: JitCompiler, memberCode: jitCode): jitCode {
        if (!memberCode) return undefined;
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${comp.vλl}) {${memberCode}}`;
    }
    getSkipCode(prop: string): string {
        const namedChildren = (this.getParent() as InterfaceRunType).getNamedChildren();
        const skipNames = namedChildren.length
            ? namedChildren.map((child) => `${child.getChildLiteral()} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }
}
