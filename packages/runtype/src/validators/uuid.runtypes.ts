/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {addFormatterToCache, compilePureFunctionCall} from '../lib/formats';
import {JitRunTypeValidator} from '../lib/formats';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {jitUtils} from '../lib/jitUtils';
import {MockOperation} from '../types';
import {TypeFormat} from '../lib/formats.runtypes';

export type UUID_Params = {
    version: '4' | '7';
};

// IDs
export type UUID_V4 = TypeFormat<string, 'url', {version: '4'}>;
export type UUID_V7 = TypeFormat<string, 'url', {version: '7'}>;

// UUID validator
export class UUID_Validator extends JitRunTypeValidator<UUID_Params> {
    static readonly id = 'uuid' as const;
    readonly kind = ReflectionKind.string;
    readonly name = UUID_Validator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, {version: '4'});
        return compilePureFunctionCall(comp, rt, isUUID, params);
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement UUID validation error logic
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const {version} = this.getParams(rt, {version: '4'});
        return version === '4' ? crypto.randomUUID() : uuidV7();
    }
}

/** Generates a random UUID V7, no hyphens are included in the uuid */
export function uuidV7(): string {
    const uuid = crypto.randomUUID();
    const timestamp = Date.now().toString(16);
    return timestamp.substring(0, 8) + '-7' + uuid.substring(9);
}

export function isUUID(value: string, utl, p: UUID_Params): boolean {
    if (value.length !== 32) return false;
    if (value[12] !== p.version) return false;
    if (value[16] < '8' || value[16] > 'b') return false;
    for (let i = 0; i < 32; i++) {
        const c = value.charCodeAt(i);
        if (c < 48 || c > 102) return false;
        if (c > 57 && c < 97) return false;
        if (c > 70 && c < 97) return false;
    }
    return true;
}

jitUtils.addPureFn(isUUID);
addFormatterToCache(new UUID_Validator());
