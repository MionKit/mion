/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../_deepkit/src/reflection/type';
import type {JitContext, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected, toLiteral} from '../utils';
import {random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class EnumRunType extends AtomicRunType<TypeEnum> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    public readonly values: (string | number | undefined | null)[];
    public readonly indexKind: ReflectionKind;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeEnum,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.values = src.values;
        this.indexKind = src.indexType.kind;
    }
    getJitId(): number | string {
        return `${this.indexKind}{${this.values.map((v) => v).join(',')}}`;
    }
    compileIsType(ctx: JitContext): string {
        return this.values.map((v) => `${ctx.args.vλl} === ${toLiteral(v)}`).join(' || ');
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${this.compileIsType(ctx)})) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        if (this.indexKind === ReflectionKind.number) return ctx.args.vλl;
        return `JSON.stringify(${ctx.args.vλl})`;
    }
    mock(ctx?: Pick<MockContext, 'enumIndex'>): string | number | undefined | null {
        const i = ctx?.enumIndex || random(0, this.values.length - 1);
        return this.values[i];
    }
}
