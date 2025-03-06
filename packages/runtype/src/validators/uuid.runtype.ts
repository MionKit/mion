/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {registerFormatter, compilePureFunctionCall, registerPureFunctionWithCtx} from '../lib/formats';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {GenericPureFunction, MockOperation} from '../types';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work

export type UUID_Params = {
    version: 4 | 7;
};

export const defUUIDParams = {
    version: 4,
} as const satisfies UUID_Params;

// IDs
export type UUID_V4 = TypeFormat<string, typeof UUID_Validator.id, {version: 4}>;
export type UUID_V7 = TypeFormat<string, typeof UUID_Validator.id, {version: 7}>;

// UUID validator
export class UUID_Validator extends JitRunTypeValidator<UUID_Params> {
    static readonly id = 'uuid' as const;
    readonly kind = ReflectionKind.string;
    readonly name = UUID_Validator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defUUIDParams);
        // version must be set as a string to call pure function isUUID, this is so no transform is needed when comparing with uuid charat
        return compilePureFunctionCall(comp, rt, isUUID, {...params, version: String(params.version)});
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';

        const params = this.getParams(rt, defUUIDParams);
        const formatError = {name: this.name, invalid: {version: params.version}};
        return `if (!(${isTypeCode})) ${comp.callJitErr(rt, formatError)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const {version} = this.getParams(rt, defUUIDParams);
        return version === 4 ? crypto.randomUUID() : mockUuidV7();
    }
    validateParams(rt: BaseRunType, params: UUID_Params) {
        if (params.version !== 4 && params.version !== 7) {
            throw new Error(`Invalid UUID version: ${params.version}, must be either 4 or 7`);
        }
    }
}

/** Generates a random UUID V7, no hyphens are included in the uuid */
export function mockUuidV7(): string {
    const uuid = crypto.randomUUID();
    const timestamp = BigInt(Date.now());
    const tHex = timestamp.toString(16).padStart(12, '0');
    return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
}

/** @reflection never */
export function isUUID() {
    type UUID_VString = {version: '4' | '7'};
    return function is_uuid(value: string, p: UUID_VString) {
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
    } as GenericPureFunction<UUID_VString>;
}

// ############### Register runtypes ###############

registerPureFunctionWithCtx(isUUID);
export const uuidValidator = registerFormatter(new UUID_Validator());
