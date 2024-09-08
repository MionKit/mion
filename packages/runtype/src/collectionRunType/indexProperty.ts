import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {JitContext, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {isFunctionKind, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {NumberRunType} from '../atomicRunType/number';
import {StringRunType} from '../atomicRunType/string';
import {SymbolRunType} from '../atomicRunType/symbol';
import {jitNames} from '../constants';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends MemberRunType<TypeIndexSignature> {
    public readonly memberType: RunType;
    public readonly indexKeyType: NumberRunType | StringRunType | SymbolRunType;
    public readonly memberName: string | number;
    public readonly shouldSerialize: boolean;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';
    public readonly memberIndex: number = 0;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIndexSignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        this.indexKeyType = visitor(src.index, parents, opts) as NumberRunType | StringRunType | SymbolRunType;
        parents.pop();
        this.memberName = `${this.src.index.kind}`;
        this.shouldSerialize = !isFunctionKind(src.type.kind) && src.index.kind !== ReflectionKind.symbol;
        this.jitId = `[${this.memberName}]:${this.memberType.jitId}`;
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
    }
    useArrayAccessorForJit() {
        return true;
    }
    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const prop = `prΦp${ctx.parents.length}`;
            const compC = (childCtx: JitContext) => this.memberType.compileIsType(childCtx);
            const itemsCode = compileChildren(compC, this, ctx, prop);
            return `
                for (const ${prop} in ${ctx.args.value}) {
                    if (!(${itemsCode})) return false;
                }
                return true;
            `;
        };

        return handleCircularIsType(compile, this, ctx, true);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const prop = `prΦp${ctx.parents.length}`;
            const compC = (childCtx: TypeErrorsContext) => this.memberType.compileTypeErrors(childCtx);
            const itemsCode = compileChildren(compC, this, ctx, prop);
            return `
                for (const ${prop} in ${ctx.args.value}) {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, true);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, false);
    }
    private compileJsonDE(ctx: JitContext, isEncode = false): string {
        const shouldSkip = isEncode ? shouldSkipJsonEncode(this) : shouldSkipJsonDecode(this);
        if (shouldSkip) return '';
        const compile = () => {
            const prop = `prΦp${ctx.parents.length}`;
            const compC = (childCtx: JitContext) => {
                return isEncode ? this.memberType.compileJsonEncode(childCtx) : this.memberType.compileJsonDecode(childCtx);
            };
            const itemsCode = compileChildren(compC, this, ctx, prop);
            return `
                for (const ${prop} in ${ctx.args.value}) {
                    ${itemsCode}
                }
            `;
        };
        const circular = isEncode ? handleCircularJsonEncode : handleCircularJsonDecode;
        return circular(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const prop = `prΦp${ctx.parents.length}`;
            const arrName = `prΦpsλrr${ctx.parents.length}`;
            const compC = (childCtx: JitContext) => {
                const jsonVal = this.memberType.compileJsonStringify(childCtx);
                return `if (${childCtx.args.value} !== undefined) ${arrName}.push(${jitNames.utils}.asJSONString(${prop}) + ':' + ${jsonVal})`;
            };
            const itemsCode = compileChildren(compC, this, ctx, prop);
            return `
                const ${arrName} = [];
                for (const ${prop} in ${ctx.args.value}) {
                    ${itemsCode}
                }
                return ${arrName}.join(',');
            `;
        };
        return handleCircularJsonStringify(compile, this, ctx, true);
    }
    mock(ctx?: MockContext): any {
        const length = Math.floor(Math.random() * 10);
        const parentObj = ctx?.parentObj || {};
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.indexKeyType instanceof NumberRunType):
                    propName = i;
                    break;
                case !!(this.indexKeyType instanceof StringRunType):
                    propName = `key${i}`;
                    break;
                case !!(this.indexKeyType instanceof SymbolRunType):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentObj[propName] = this.memberType.mock(ctx);
        }
    }
}
