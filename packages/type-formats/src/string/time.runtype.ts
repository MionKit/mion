/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BrandTime} from '@mionkit/core';
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, TypeFormat, RunTypeOptions, registerFormatter} from '@mionkit/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {ReflectionKind} from '@deepkit/type';
import {paramVal} from '../utils.ts';
import {FormatParams_Time} from '@mionkit/core';
import {
    cpf_isTimeString_ISO_TZ,
    cpf_isTimeString_ISO,
    cpf_isTimeString_HHmmss,
    cpf_isTimeString_HHmm,
    cpf_isTimeString_mmss,
    cpf_isHours,
    cpf_isMinutes,
    cpf_isSeconds,
} from '../type-formats-pure-fns.ts';

// Time validator
/** @reflection never */
export class TimeStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Time> {
    static id = 'time' as const;
    kind = ReflectionKind.string;
    name = TimeStringRunTypeFormat.id;
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const formatFn = this.getFormatPureFn(paramVal(params.format as BrandTime));
        return {code: this.compilePureFunctionCall(comp, rt, formatFn).callCode, type: 'E'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const isTypeCodeObj = this.emitIsType(comp, rt);
        const isTypeCode = isTypeCodeObj.code;
        if (!isTypeCode) return {code: '', type: 'S'};
        const params = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return {code: `if (!(${isTypeCode})) ${errFn('format', paramVal(params.format))}`, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
        const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        switch (paramVal(params.format)) {
            case 'ISO': // ISO
            case 'HH:mm:ss[.mmm]TZ': // 'HH:mm:ss[.mmm]TZ'
                return `${hours}:${minutes}:${seconds}${mockMilliseconds()}${mockTimeZone()}`;
            case 'HH:mm:ss[.mmm]': // 'HH:mm:ss[.mmm]'
                return `${hours}:${minutes}:${seconds}${mockMilliseconds()}`;
            case 'HH:mm:ss': // 'HH:mm:ss'
                return `${hours}:${minutes}:${seconds}`;
            case 'HH:mm': // 'HH:mm'
                return `${hours}:${minutes}`;
            case 'mm:ss': // 'mm:ss'
                return `${minutes}:${seconds}`;
            case 'HH': // 'HH'
                return hours;
            case 'mm': // 'mm'
                return minutes;
            case 'ss': // 'ss'
                return seconds;
            default:
                throw new Error(`Invalid time format: ${paramVal(params.format)}`);
        }
    }
    getFormatPureFn(format: FormatStringTime) {
        switch (format) {
            case 'ISO':
            case 'HH:mm:ss[.mmm]TZ':
                return cpf_isTimeString_ISO_TZ;
            case 'HH:mm:ss[.mmm]':
                return cpf_isTimeString_ISO;
            case 'HH:mm:ss':
                return cpf_isTimeString_HHmmss;
            case 'HH:mm':
                return cpf_isTimeString_HHmm;
            case 'mm:ss':
                return cpf_isTimeString_mmss;
            case 'HH':
                return cpf_isHours;
            case 'mm':
                return cpf_isMinutes;
            case 'ss':
                return cpf_isSeconds;
            default:
                throw new Error(`Invalid time format: ${format}`);
        }
    }
}

// ######### Mocking functions #########
/** @reflection never */
export function mockMilliseconds(): string {
    const showMilliseconds = Math.random() > 0.5;
    if (!showMilliseconds) return '';
    return `.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}
/** @reflection never */
export function mockTimeZone(): string {
    const isZ = Math.random() > 0.5;
    if (isZ) return 'Z';
    const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
    const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    return `${Math.random() > 0.5 ? '+' : '-'}${hours}:${minutes}`;
}

// ######### Registering the time validator #########
/** @reflection never */
export const TIME_RUN_TYPE_FORMATTER = registerFormatter(new TimeStringRunTypeFormat());

// ############### Type  ###############

export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};

/** Time string format, always branded with 'time'. */
export type FormatStringTime<P extends FormatParams_Time = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<
    string,
    typeof TimeStringRunTypeFormat.id,
    P,
    'time'
>;
