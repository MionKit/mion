import {TypeRest} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {compileChildren} from '../jitCompiler';
import {JitContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class RestParamsRunType extends MemberRunType<TypeRest> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly memberName: string;
    public readonly default: any;
    public readonly jitId: string;
    public readonly memberIndex: number = 0;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeRest,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        parents.pop();
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.memberName = '...';
        this.jitId = `...${src.kind}:${this.memberType.jitId}`;
    }
    useArrayAccessorForJit() {
        return true;
    }
    compileIsType(ctx: JitContext): string {
        const indexName = `pλrλm${ctx.parents.length}`;
        const compC = (newCtx: JitContext) => this.memberType.compileIsType(newCtx);
        const itemCode = compileChildren(compC, this, ctx, indexName);
        return `(function() {
            for (let ${indexName} = ${this.memberIndex}; ${indexName} < ${ctx.args.value}.length; ${indexName}++) {
                if (!(${itemCode})) return false;
            }
            return true;
        })()`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const indexName = `pλrλm${ctx.parents.length}`;
        const compC = (newCtx: TypeErrorsContext) => this.memberType.compileTypeErrors(newCtx);
        const itemCode = compileChildren(compC, this, ctx, indexName);
        return `for (let ${indexName} = ${this.memberIndex}; ${indexName} < ${ctx.args.value}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, true);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, false);
    }
    private compileJsonDE(ctx: JitContext, isEncode = false): string {
        const shouldSkip = isEncode ? shouldSkipJsonEncode(this) : shouldSkipJsonDecode(this);
        const compileFn = isEncode ? this.memberType.compileJsonEncode : this.memberType.compileJsonDecode;
        if (shouldSkip) return '';
        const indexName = `pλrλm${ctx.parents.length}`;
        const compC = (newCtx: JitContext) => compileFn(newCtx);
        const itemCode = compileChildren(compC, this, ctx, indexName);
        return `for (let ${indexName} = ${this.memberIndex}; ${indexName} < ${ctx.args.value}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonStringify(ctx: JitContext): string {
        const varName = ctx.args.value;
        const arrName = `rεsultλrr${ctx.parents.length}`;
        const itemName = `itεm${ctx.parents.length}`;
        const indexName = `indεx${ctx.parents.length}`;
        const isFist = this.memberIndex === 0;
        const sep = isFist ? '' : `','+`;
        const compC = (newCtx: JitContext) => this.memberType.compileJsonStringify(newCtx);
        const itemCode = compileChildren(compC, this, ctx, indexName);
        return `(function(){
            const ${arrName} = [];
            for (let ${indexName} = ${this.memberIndex}; ${indexName} < ${varName}.length; ${indexName}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        })()`;
    }
    mock(...args: any[]): string {
        return this.memberType.mock(...args);
    }
}
