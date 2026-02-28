/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode} from '@mionkit/run-types';
import {registerFormatter, BaseRunTypeFormat, RunTypeOptions, TypeFormat} from '@mionkit/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {ReflectionKind} from '@deepkit/type';
import {randomUUID_V7} from '@mionkit/core';
import {paramVal} from '../utils.ts';
import {FormatParams_UUID} from '@mionkit/core';
import {cpf_isUUID} from '../type-formats-pure-fns.ts';

// UUID validator
/** @reflection never */
export class UUIDRunTypeFormat extends BaseRunTypeFormat<FormatParams_UUID> {
    static readonly id = 'uuid' as const;
    readonly kind = ReflectionKind.string;
    readonly name = UUIDRunTypeFormat.id;
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        // version must be set as a string to call pure function isUUID, this is so no transform is needed when comparing with uuid charat
        return {code: this.compilePureFunctionCall(comp, rt, cpf_isUUID, params).callCode, type: 'E'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const isTypeCodeObj = this.emitIsType(comp, rt);
        const isTypeCode = isTypeCodeObj.code;
        if (!isTypeCode) return {code: '', type: 'S'};
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return {code: `if (!(${isTypeCode})) ${errFn('version', paramVal(params.version))}`, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        return params.version === '4' ? crypto.randomUUID() : randomUUID_V7();
    }
    validateParams(_rt: BaseRunType, params: FormatParams_UUID) {
        if (params.version !== '4' && params.version !== '7') {
            throw new Error(`Invalid UUID version: ${params.version}, must be either 4 or 7`);
        }
    }
    emitFormat?; // no format needed
}

// ############### Register runtypes ###############

export const UUID_RUN_TYPE_FORMATTER = registerFormatter(new UUIDRunTypeFormat());

/** UUID v4 format, always branded with 'uuid'. */
export type FormatUUIDv4 = TypeFormat<string, typeof UUIDRunTypeFormat.id, {version: '4'}, 'uuid'>;
/** UUID v7 format, always branded with 'uuid'. */
export type FormatUUIDv7 = TypeFormat<string, typeof UUIDRunTypeFormat.id, {version: '7'}, 'uuid'>;
