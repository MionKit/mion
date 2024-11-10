import type {TypeRest} from '../_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {MemberRunType} from '../baseRunTypes';
import {JitFnIDs} from '../constants';
import {JitFnID, MockContext} from '../types';
import { childIsExpression } from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class RestParamsRunType extends MemberRunType<TypeRest> {
    src: TypeRest = null as any; // will be set after construction
    isOptional() {
        return true;
    }
    getChildVarName(): string {
        return `e${this.getNestLevel()}`;
    }
    getChildLiteral(): string {
        return this.getChildVarName();
    }
    useArrayAccessor(): true {
        return true;
    }
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const itemCode = this.getMemberType().compileIsType(cop);
        return `
            for (let ${index} = ${this.getChildIndex()}; ${index} < ${varName}.length; ${index}++) {
                if (!(${itemCode})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const itemCode = this.getMemberType().compileTypeErrors(cop);
        return `for (let ${index} = ${this.getChildIndex()}; ${index} < ${varName}.length; ${index}++) {${itemCode}}`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.getChildIndex()}; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.getChildIndex()}; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const varName = cop.vλl;
        const arrName = `res${this.getNestLevel()}`;
        const itemName = `its${this.getNestLevel()}`;
        const index = this.getChildVarName();
        const isFist = this.getChildIndex() === 0;
        const sep = isFist ? '' : `','+`;
        const itemCode = this.getMemberType().compileJsonStringify(cop);
        return `
            const ${arrName} = [];
            for (let ${index} = ${this.getChildIndex()}; ${index} < ${varName}.length; ${index}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        `;
    }
    _compileHasUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeyErrors(): string {
        return '';
    }
    _compileStripUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeysToUndefined(): string {
        return '';
    }
    mock(ctx?: MockContext): string {
        return this.getMemberType().mock(ctx);
    }
}
