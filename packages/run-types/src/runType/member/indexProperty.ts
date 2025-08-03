import {ReflectionKind, TypeIndexSignature} from '@deepkit/type';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitFnID, type jitCode} from '../../types';
import {CodeType} from '../../constants.functions';
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
        const index = (this.src as TypeIndexSignature).index?.kind || undefined;
        if (index === ReflectionKind.symbol) {
            return comp?.fnID !== JitFunctions.toCode.id;
        }
        return false;
    }
    // IndexSignatureRunType uses 'RB' (return block) code type for certain operations
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!childCode) return undefined;
        return {
            code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}){if (!(${childCode.code})) return false;} return true;`,
            codeType: 'RB',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        return {
            code: `for (const ${this.getChildVarName(comp)} in ${comp.vλl}) {${childCode.code}}`,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);

        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const skipCode = this.getSkipCode(comp, prop);

        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: `for (const ${prop} in ${varName}){${skipCode} ${code}}`,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileHasUnknownKeys(comp);
        if (!memberCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        return {
            code: `for (const ${prop} in ${varName}) {const ${resultVal} = ${memberCode.code};if (${resultVal}) return true;}return false;`,
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
        const prop = this.getChildVarName(comp);
        return {
            code: `for (const ${prop} in ${comp.vλl}) {${memberCode.code}}`,
            codeType: 'S',
            skipJit: false,
            children: [memberCode]
        };
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
