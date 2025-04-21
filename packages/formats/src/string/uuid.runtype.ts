/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {GenericPureFunction, FormatParam} from '@mionkit/core/src/types';
import type {BaseRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {registerFormatter, registerPureFnClosure} from '@mionkit/run-types/src/lib/formats';
import {BaseRunTypeFormat} from '@mionkit/run-types/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {RunTypeOptions} from '@mionkit/run-types/src/types';
import {TypeFormat} from '@mionkit/run-types/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {fpVal} from '@mionkit/run-types/src/lib/utils';
import {randomUUID_V7} from '@mionkit/core/src/utils';

// UUID validator
export class UUIDRunTypeFormat extends BaseRunTypeFormat<FormatParams_UUID> {
    static readonly id = 'uuid' as const;
    readonly kind = ReflectionKind.string;
    readonly name = UUIDRunTypeFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        // version must be set as a string to call pure function isUUID, this is so no transform is needed when comparing with uuid charat
        return this.compilePureFunctionCall(comp, rt, isUUID, params).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return `if (!(${isTypeCode})) ${errFn('version', fpVal(params.version))}`;
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
    _compileFormat?; // no format needed
}

// ############### Pure Functions ###############

/** @reflection never */
export function isUUID() {
    return function is_uuid(value: string, p: FormatParams_UUID) {
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
    } as GenericPureFunction<FormatParams_UUID>;
}

// ############### Register runtypes ###############

registerPureFnClosure(isUUID);
export const UUID_RUN_TYPE_FORMATTER = registerFormatter(new UUIDRunTypeFormat());

// ############### Type  ###############

type FormatParams_UUID = {version: FormatParam<'4' | '7'>};
export type UUIDFormat_V4 = TypeFormat<string, typeof UUIDRunTypeFormat.id, {version: '4'}>;
export type UUIDFormat_V7 = TypeFormat<string, typeof UUIDRunTypeFormat.id, {version: '7'}>;
