import type {TypePromise} from '../_deepkit/src/reflection/type';
import type {JitContext, MockOptions, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getErrorPath, getExpected} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class PromiseRunType extends AtomicRunType<TypePromise> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly resolvedType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePromise,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.resolvedType = visitor(src.type, [...parents, this], opts);
    }
    compileIsType(ctx: JitContext): string {
        return `${ctx.args.value} instanceof Promise`;
    }
    resolvedIsTypeJIT(ctx: JitContext): string {
        return this.resolvedType.compileIsType(ctx);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const {value, errors} = ctx.args;
        return `if (!(${value} instanceof Promise)) ${errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    resolveTypeErrorsJIT(ctx: TypeErrorsContext): string {
        return this.resolvedType.compileTypeErrors(ctx);
    }
    compileJsonEncode(): string {
        throw new Error(`${this.getName()} can not be encoded to json.`);
    }
    compileJsonDecode(): string {
        throw new Error(`${this.getName()} can not be decoded from json.`);
    }
    compileJsonStringify(): string {
        throw new Error(`${this.getName()} can not be stringified.`);
    }
    mock(ctx?: Pick<MockOptions, 'promiseReject' | 'promiseTimeOut'>): Promise<any> {
        const timeOut = ctx?.promiseTimeOut || 1;
        return new Promise((resolve, reject) => {
            if (timeOut > 0) {
                setTimeout(() => {
                    if (ctx?.promiseReject) reject(ctx.promiseReject);
                    else resolve(this.resolvedType.mock(ctx));
                }, timeOut);
                return;
            }
            if (ctx?.promiseReject) reject(ctx.promiseReject);
            else resolve(this.resolvedType.mock(ctx));
        });
    }
}
