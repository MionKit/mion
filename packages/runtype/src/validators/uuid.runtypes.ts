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
    version: 4 | 7;
};

// IDs
export type UUID_V4 = TypeFormat<string, 'uuid', {version: 4}>;
export type UUID_V7 = TypeFormat<string, 'uuid', {version: 7}>;

// UUID validator
export class UUID_Validator extends JitRunTypeValidator<UUID_Params> {
    static readonly id = 'uuid' as const;
    readonly kind = ReflectionKind.string;
    readonly name = UUID_Validator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, {version: 4});
        // version must be set as a string to call pure function isUUID
        return compilePureFunctionCall(comp, rt, isUUID, {...params, version: String(params.version)});
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement UUID validation error logic
        const info = {format: this.name, typeName: rt.src.typeName};
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', info)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const {version} = this.getParams(rt, {version: 4});
        return version === 4 ? crypto.randomUUID() : uuidV7();
    }
    validateParams(rt: BaseRunType, params: UUID_Params) {
        if (params.version !== 4 && params.version !== 7) {
            throw new Error(`Invalid UUID version: ${params.version}, must be either 4 or 7`);
        }
    }
}

/** Generates a random UUID V7, no hyphens are included in the uuid */
export function uuidV7(): string {
    const uuid = crypto.randomUUID();
    const timestamp = BigInt(Date.now());
    const tHex = timestamp.toString(16).padStart(12, '0');
    return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
}

export function isUUID(value: string, utl, p: {version: '4' | '7'}): boolean {
    if (value.length !== 36) return false;
    for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
            if (value[i] !== '-') return false;
        } else if (i === 14) {
            if (value[i] !== p.version) return false;
        } else {
            const charCode = value.charCodeAt(i);
            const is09 = charCode >= 48 && charCode <= 57;
            const isaf = charCode >= 97 && charCode <= 102;
            const isAF = charCode >= 65 && charCode <= 70;
            if (!(is09 || isaf || isAF)) return false;
        }
    }
    return true;
}

// ############### Register runtypes ###############

jitUtils.addPureFn(isUUID);
addFormatterToCache(new UUID_Validator());
