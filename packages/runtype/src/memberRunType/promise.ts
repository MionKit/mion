import {ReflectionKind, type TypePromise} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {SingleItemMemberRunType} from '../baseRunTypes';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.promise,
};

export class PromiseRunType extends SingleItemMemberRunType<TypePromise> {
    src: TypePromise = null as any; // will be set after construction
    constants = () => jitConstants;
    getName() {
        return 'promise';
    }
    getMemberName(): '' {
        return '';
    }
    isOptional(): boolean {
        return false;
    }
    useArrayAccessor() {
        return false;
    }
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return false;
    }
    protected _compileIsType(): string {
        throw new Error(`Jit compilation disabled for Promises.`);
    }
    protected _compileTypeErrors(): string {
        throw new Error(`Jit compilation disabled for Promises.`);
    }
    protected _compileJsonEncode(): string {
        throw new Error(`Jit compile disabled for Promises.`);
    }
    protected _compileJsonDecode(): string {
        throw new Error(`Jit compile disabled for Promises.`);
    }
    protected _compileJsonStringify(): string {
        throw new Error(`Jit compile disabled for Promises.`);
    }
    mock(ctx?: Pick<MockContext, 'promiseReject' | 'promiseTimeOut'>): Promise<any> {
        const timeOut = ctx?.promiseTimeOut || 1;
        return new Promise((resolve, reject) => {
            if (timeOut > 0) {
                setTimeout(() => {
                    if (ctx?.promiseReject) reject(ctx.promiseReject);
                    else resolve(this.getMemberType().mock(ctx));
                }, timeOut);
                return;
            }
            if (ctx?.promiseReject) reject(ctx.promiseReject);
            else resolve(this.getMemberType().mock(ctx));
        });
    }
    getMemberPathItem() {
        return undefined;
    }
}
