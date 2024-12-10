/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, type TypePromise} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConfig} from '../../types';
import {MemberRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: true,
    skipToJsonVal: true,
    skipFromJsonVal: true,
    jitId: ReflectionKind.promise,
};

export class PromiseRunType extends MemberRunType<TypePromise> {
    _compileIsType(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileToJsonVal(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileFromJsonVal(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonStringify(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }

    getJitConfig() {
        return jitConstants;
    }
    isOptional(): boolean {
        return false;
    }
    getChildVarName(): string | number {
        return 'p';
    }
    getChildLiteral(): string | number {
        return 'p';
    }
    useArrayAccessor(): boolean {
        return false;
    }
    _mock(ctx: Pick<MockOperation, 'promiseReject' | 'promiseTimeOut'>): Promise<any> {
        const timeOut = ctx.promiseTimeOut || 1;
        return new Promise((resolve, reject) => {
            if (timeOut > 0) {
                setTimeout(() => {
                    if (ctx.promiseReject) reject(ctx.promiseReject);
                    else resolve(this.getMemberType().mock(ctx));
                }, timeOut);
                return;
            }
            if (ctx.promiseReject) reject(ctx.promiseReject);
            else resolve(this.getMemberType().mock(ctx));
        });
    }
}
