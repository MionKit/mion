import {ReflectionKind, TypeIndexSignature} from '../../lib/_deepkit/src/reflection/type';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {JitConfig, JitFnID, MockOperation, Mutable} from '../../types';
import {JitFnIDs} from '../../constants';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {InterfaceRunType} from '../collection/interface';
import {childIsExpression} from '../../lib/utils';
import {random} from '../../lib/mock';

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
            jc.skipToJsonVal = true;
            jc.skipFromJsonVal = true;
        }
        return jc;
    }
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
            case JitFnIDs.jsonStringify:
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler) {
        const childCode = this.getJitChild()?.compileIsType(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}){if (!(${childCode})) return false;} return true;`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const childCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        return `for (const ${this.getChildVarName()} in ${comp.vλl}) {${childCode}}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        const child = this.getToJsonValChild();
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);

        const isExpression = childIsExpression(JitFnIDs.toJsonVal, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        const child = this.getFromJsonValChild();
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);

        const isExpression = childIsExpression(JitFnIDs.fromJsonVal, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileJsonStringify(comp: JitCompiler) {
        const child = this.getJitChild();
        const jsonVal = child?.compileJsonStringify(comp);
        if (!child || !jsonVal) return undefined;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const arrName = `ls${this.getNestLevel()}`;
        const sep = this.skipCommas ? '' : '+","';
        const skipCode = this.getSkipCode(prop);
        return `
            const ${arrName} = [];
            for (const ${prop} in ${varName}) {
                ${skipCode}
                if (${prop} !== undefined) ${arrName}.push(utl.asJSONString(${prop}) + ':' + ${jsonVal});
            }
            return ${arrName}.join(',')${sep};
        `;
    }
    _compileHasUnknownKeys(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!memberCode) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const resultVal = `res${this.getNestLevel()}`;
        return `for (const ${prop} in ${varName}) {const ${resultVal} = ${memberCode};if (${resultVal}) return true;}return false;`;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler) {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }
    _mock(ctx: MockOperation): any {
        const length = random(0, ctx.maxRandomItemsLength);
        const parentObj = ctx.parentObj || {};
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.src.index.kind === ReflectionKind.number):
                    propName = i;
                    break;
                case !!(this.src.index.kind === ReflectionKind.string):
                    propName = `key${i}`;
                    break;
                case !!(this.src.index.kind === ReflectionKind.symbol):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentObj[propName] = this.getMemberType().mock(ctx);
        }
        return parentObj;
    }
    private traverseCode(comp: JitCompiler, memberCode: string | undefined): string | undefined {
        if (!memberCode) return undefined;
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${comp.vλl}) {${memberCode}}`;
    }
    private getSkipCode(prop: string): string {
        const namedChildren = (this.getParent() as InterfaceRunType).getNamedChildren();
        const skipNames = namedChildren.length
            ? namedChildren.map((child) => `${child.getChildLiteral()} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }
}
