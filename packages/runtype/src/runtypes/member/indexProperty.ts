import {ReflectionKind, TypeIndexSignature} from '../../lib/_deepkit/src/reflection/type';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {JitConstants, JitFnID, MockOperation, Mutable} from '../../types';
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
    src: TypeIndexSignature = null as any; // will be set after construction
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
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        const jc = super.getJitConstants(stack) as Mutable<JitConstants>;
        const index = (this.src as TypeIndexSignature).index?.kind || undefined;
        if (index === ReflectionKind.symbol) {
            jc.skipJit = true;
            jc.skipJsonEncode = true;
            jc.skipJsonDecode = true;
        }
        return jc;
    }
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return 'true';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${varName}){if (!(${child.compileIsType(comp)})) return false;}return true;`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${varName}) {${child.compileTypeErrors(comp)}}`;
    }

    private getSkipCode(prop: string): string {
        const namedChildren = (this.getParent() as InterfaceRunType).getNamedChildren();
        const skipNames = namedChildren.length
            ? namedChildren.map((child) => `${child.getChildLiteral()} === ${prop}`).join(' || ')
            : '';
        return namedChildren.length ? `if (${skipNames}) continue;` : '';
    }

    _compileJsonEncode(comp: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);
        const childCode = child.compileJsonEncode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const skipCode = this.getSkipCode(prop);
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (const ${prop} in ${varName}){${skipCode} ${code}}`;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return `''`;
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const arrName = `ls${this.getNestLevel()}`;
        const jsonVal = child.compileJsonStringify(comp);
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

    _compileHasUnknownKeys(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getMemberType().compileHasUnknownKeys(comp);
        if (!memberCode) return '';
        const varName = comp.vλl;
        const prop = this.getChildVarName();
        const resultVal = `res${this.getNestLevel()}`;
        return `for (const ${prop} in ${varName}) {const ${resultVal} = ${memberCode};if (${resultVal}) return true;}return false;`;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getMemberType().compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getMemberType().compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getMemberType().compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }
    traverseCode(comp: JitCompiler, memberCode: string): string {
        if (!memberCode) return '';
        const prop = this.getChildVarName();
        return `for (const ${prop} in ${comp.vλl}) {${memberCode}}`;
    }
    _mock(ctx: MockOperation): any {
        const length = random(0, ctx.maxRandomArrayLength);
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
}
