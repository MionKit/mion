import {TypeRest} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {MockContext} from '../types';

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
        return `iε${this.getNestLevel()}`;
    }
    getChildLiteral(): string {
        return this.getChildVarName();
    }
    useArrayAccessor(): true {
        return true;
    }
    hasReturnCompileIsType(): boolean {
        return true;
    }
    hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    _compileIsType(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const indexName = this.getChildVarName();
        const itemCode = this.getMemberType().compileIsType(cop);
        return `
            for (let ${indexName} = ${this.getChildIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {
                if (!(${itemCode})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const varName = cop.vλl;
        const indexName = this.getChildVarName();
        const itemCode = this.getMemberType().compileTypeErrors(cop);
        return `for (let ${indexName} = ${this.getChildIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return this.compileJsonDE(cop, true);
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return this.compileJsonDE(cop, false);
    }
    private compileJsonDE(cop: JitCompileOp, isEncode = false): string {
        const varName = cop.vλl;
        const indexName = this.getChildVarName();
        const itemCode = isEncode ? this.getMemberType().compileJsonEncode(cop) : this.getMemberType().compileJsonDecode(cop);
        return `for (let ${indexName} = ${this.getChildIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const arrName = `rεsultλrr${cop.length}`;
        const itemName = `itεm${cop.length}`;
        const indexName = this.getChildVarName();
        const isFist = this.getChildIndex() === 0;
        const sep = isFist ? '' : `','+`;
        const itemCode = this.getMemberType().compileJsonStringify(cop);
        return `
            const ${arrName} = [];
            for (let ${indexName} = ${this.getChildIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        `;
    }
    mock(ctx?: MockContext): string {
        return this.getMemberType().mock(ctx);
    }
}
