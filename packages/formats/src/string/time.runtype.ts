/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import {BaseRunTypeFormat} from '@mionkit/runtype/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {GenericPureFunction, MockOperation, type FormatParam} from '@mionkit/runtype/src/types';
import {registerFormatter, registerPureFnClosuresGroup, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {fpVal} from '@mionkit/runtype/src/lib/utils';

// Time validator
export class TimeStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Time> {
    static id = 'time' as const;
    kind = ReflectionKind.string;
    name = TimeStringRunTypeFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const formatFn = this.getFormatPureFn(fpVal(params.format));
        return this.compilePureFunctionCall(comp, rt, formatFn).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return `if (!(${isTypeCode})) ${errFn('format', fpVal(params.format))}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
        const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        switch (fpVal(params.format)) {
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
                throw new Error(`Invalid time format: ${fpVal(params.format)}`);
        }
    }
    getFormatPureFn(format: TimeFormat) {
        switch (format) {
            case 'ISO':
            case 'HH:mm:ss[.mmm]TZ':
                return isTimeString_ISO_TZ;
            case 'HH:mm:ss[.mmm]':
                return isTimeString_ISO;
            case 'HH:mm:ss':
                return isTimeString_HHmmss;
            case 'HH:mm':
                return isTimeString_HHmm;
            case 'mm:ss':
                return isTimeString_mmss;
            case 'HH':
                return isHours;
            case 'mm':
                return isMinutes;
            case 'ss':
                return isSeconds;
            default:
                throw new Error(`Invalid time format: ${format}`);
        }
    }
}

// ######### Mocking functions #########

export function mockMilliseconds(): string {
    const showMilliseconds = Math.random() > 0.5;
    if (!showMilliseconds) return '';
    return `.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

export function mockTimeZone(): string {
    const isZ = Math.random() > 0.5;
    if (isZ) return 'Z';
    const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
    const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    return `${Math.random() > 0.5 ? '+' : '-'}${hours}:${minutes}`;
}

// ######### Time pure functions #########

/** @reflection never */
export function isTimeZone(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    return function is_tz(timeZone: string): timeZone is 'TZ' {
        const isZ = timeZone === 'Z' || timeZone === 'z';
        if (isZ) return true;
        const tzParts = timeZone.split(':') as ['hh', 'mm'];
        if (tzParts.length !== 2) return false;
        const hours = tzParts[0];
        const minutes = tzParts[1];
        return isH(hours) && isM(minutes);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isHours() {
    return function is_h(hours: string): hours is 'HH' {
        if (!hours.length || hours.length > 2) return false;
        const numberHours = Number(hours);
        if (isNaN(numberHours)) return false;
        return numberHours >= 0 && numberHours <= 23;
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isMinutes() {
    return function is_m(mins: string): mins is 'mm' {
        if (!mins.length || mins.length > 2) return false;
        const numberMinutes = Number(mins);
        if (isNaN(numberMinutes)) return false;
        return numberMinutes >= 0 && numberMinutes <= 59;
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isSeconds() {
    return function is_s(secs: string): secs is 'ss' {
        if (!secs.length || secs.length > 2) return false;
        const numberSeconds = Number(secs);
        if (isNaN(numberSeconds)) return false;
        return numberSeconds >= 0 && numberSeconds <= 59;
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isSecondsWithMs(jUtil: JITUtils) {
    const isS = jUtil.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
    return function is_s_ms(secsAnsMls: string): secsAnsMls is 'ss.mmm' {
        const parts = secsAnsMls.split('.') as ['ss', 'mmm' | undefined];
        if (parts.length > 2) return false;
        const secs = parts[0];
        if (!isS(secs)) return false;
        const mls = parts[1];
        if (mls) {
            if (mls.length !== 3) return false;
            const millisNumber = Number(mls);
            if (isNaN(millisNumber)) return false;
            if (millisNumber < 0 || millisNumber > 999) return false;
        }
        return true;
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_ISO_TZ(jUtil: JITUtils) {
    const isTWms = jUtil.getPureFn('isTimeString_ISO') as ReturnType<typeof isTimeString_ISO>;
    const isTZ = jUtil.getPureFn('isTimeZone') as ReturnType<typeof isTimeZone>;
    return function is_iso_time(value: string): boolean {
        // 'ISO' OR 'HH:mm:ss[.mmm]TZ'
        const isZ = value.endsWith('Z') || value.endsWith('z');
        const isPositiveTZ = isZ || value.indexOf('+') !== -1;
        const isNegativeTZ = isZ || value.indexOf('-') !== -1;
        if (!isZ && !isPositiveTZ && !isNegativeTZ) return false;
        const timeAndTz = isZ
            ? [value.substring(0, value.length - 1), 'Z']
            : (value.split(isPositiveTZ ? '+' : '-') as ['HH:mm:ss[.mmm]', 'TZ']);
        if (timeAndTz.length !== 2) return false;
        const time = timeAndTz[0];
        const tz = timeAndTz[1];
        return isTWms(time) && isTZ(tz);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_ISO(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isSWithMls = jUtil.getPureFn('isSecondsWithMs') as ReturnType<typeof isSecondsWithMs>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSWithMls(parts[2]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_HHmmss(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isS = jUtil.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_HHmm(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_mmss(jUtil: JITUtils) {
    const isM = jUtil.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isS = jUtil.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

// ######### Registering the time validator #########

// must be register in correct order so dependencies are available
export const pureTimeFns = [isTimeZone, isHours, isMinutes, isSeconds, isSecondsWithMs];
export const timeFunctions = [isTimeString_ISO_TZ, isTimeString_ISO, isTimeString_HHmmss, isTimeString_HHmm, isTimeString_mmss];
registerPureFnClosuresGroup(pureTimeFns);
registerPureFnClosure(isTimeString_ISO_TZ, pureTimeFns);
registerPureFnClosure(isTimeString_ISO, pureTimeFns);
registerPureFnClosure(isTimeString_HHmmss, pureTimeFns);
registerPureFnClosure(isTimeString_HHmm, pureTimeFns);
registerPureFnClosure(isTimeString_mmss, pureTimeFns);

export const TIME_RUN_TYPE_FORMATTER = registerFormatter(new TimeStringRunTypeFormat());

// ############### Type  ###############

export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};

type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
export type FormatParams_Time = {format: FormatParam<TimeFmt>};
export type TimeFormat<P extends FormatParams_Time = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<
    string,
    typeof TimeStringRunTypeFormat.id,
    P
>;
