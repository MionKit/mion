import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {SplitUnionItems} from '@mionkit/run-types/src/runType/collection/unionDiscriminator';
import type {InterfaceRunType} from '../collection/interface';
import {ReflectionKind, type TypeIndexSignature} from '@deepkit/type';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitCompilerOpts, JitFnID, type jitCode} from '../../types';
import {CodeType, JitFunctions} from '../../constants';
import {childIsExpression} from '../../lib/utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends MemberRunType<TypeIndexSignature> {
    tempUnionData: {indexFlagsVarName: string; splitUnionItems: SplitUnionItems} | undefined;
    isOptional(): boolean {
        return true;
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
    skipJit(comp: JitCompilerOpts): boolean {
        const index = (this.src as TypeIndexSignature).index?.kind || undefined;
        if (index === ReflectionKind.symbol) {
            return comp?.fnID !== JitFunctions.toCode.id;
        }
        return false;
    }
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.hasUnknownKeys.id:
            case JitFunctions.toCode.id:
                return 'RB';
            default:
                return super.getCodeType(fnID);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        if (this.tempUnionData) return this._compileIsTypeFromUnion(comp);
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}){if (!(${childCode})) return false;} return true;`;
    }

    private _compileIsTypeFromUnion(comp: JitCompiler): jitCode {
        if (!this.tempUnionData) throw new Error('tempUnionData not set');
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!childCode) return undefined;
        const {indexFlagsVarName} = this.tempUnionData;
        const propName = this.getChildVarName();
        const flagCheck = `${indexFlagsVarName}[${propName}]`;
        return `for (const ${propName} in ${comp.vλl}){if(${flagCheck}) continue;if (!(${childCode})) return false;} return true;`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}) {${childCode}}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(comp, prop);

        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(comp, prop);

        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileHasUnknownKeys(comp);
        if (!memberCode) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const resultVal = `res${this.getNestLevel()}`;
        return `for (const ${prop} in ${varName}) {const ${resultVal} = ${memberCode};if (${resultVal}) return true;}return false;`;
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
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${comp.vλl}) {${memberCode}}`;
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
            ? namedChildren.map((child) => `${child.getChildLiteral()} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }
}
