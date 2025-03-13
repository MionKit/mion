/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {GenericPureFunction, MockOperation} from '../types';
import {
    compilePureFunctionCall,
    registerFormatter,
    registerPureFunctionGroupWithCtx,
    registerPureFunctionWithCtx,
} from '../lib/formats';
import {JITUtils} from '../lib/jitUtils';

export type DefaultTimeParams = {format: 'ISO'};
export type TimeStringParams = {
    format: 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
};

export type TimeString<P extends TimeStringParams = DefaultTimeParams> = TypeFormat<string, typeof TimeStringFormat.id, P>;

// Time validator
export class TimeStringFormat extends JitRunTypeFormatter<TimeStringParams> {
    static id = 'time' as const;
    kind = ReflectionKind.string;
    name = TimeStringFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        switch (params.format) {
            case 'ISO':
            case 'HH:mm:ss[.mmm]TZ':
                return compilePureFunctionCall(comp, rt, isTimeString_ISO_TZ, params);
            case 'HH:mm:ss[.mmm]':
                return compilePureFunctionCall(comp, rt, isTimeString_ISO, params);
            case 'HH:mm:ss':
                return compilePureFunctionCall(comp, rt, isTimeString_HHmmss, params);
            case 'HH:mm':
                return compilePureFunctionCall(comp, rt, isTimeString_HHmm, params);
            case 'mm:ss':
                return compilePureFunctionCall(comp, rt, isTimeString_mmss, params);
            case 'HH':
                return compilePureFunctionCall(comp, rt, isHours, params);
            case 'mm':
                return compilePureFunctionCall(comp, rt, isMinutes, params);
            case 'ss':
                return compilePureFunctionCall(comp, rt, isSeconds, params);
            default:
                throw new Error(`Invalid time format: ${params.format}`);
        }
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt);
        const formatError = {name: this.name, invalid: {format: params.format}};
        return `if (!(${isTypeCode})) ${comp.callJitErr(rt, formatError)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
        const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        switch (params.format) {
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
                throw new Error(`Invalid time format: ${params.format}`);
        }
    }
    _compileFormat?; // no format needed
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
export function isTimeZone(utl: JITUtils) {
    const isH = utl.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = utl.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    return function is_tz(timeZone: string): timeZone is 'TZ' {
        const isZ = timeZone === 'Z' || timeZone === 'z';
        if (isZ) return true;
        const tzParts = timeZone.split(':') as ['hh', 'mm'];
        if (tzParts.length !== 2) return false;
        const hours = tzParts[0];
        const minutes = tzParts[1];
        return isH(hours) && isM(minutes);
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isHours() {
    return function is_h(hours: string): hours is 'HH' {
        if (!hours.length || hours.length > 2) return false;
        const numberHours = Number(hours);
        if (isNaN(numberHours)) return false;
        return numberHours >= 0 && numberHours <= 23;
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isMinutes() {
    return function is_m(mins: string): mins is 'mm' {
        if (!mins.length || mins.length > 2) return false;
        const numberMinutes = Number(mins);
        if (isNaN(numberMinutes)) return false;
        return numberMinutes >= 0 && numberMinutes <= 59;
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isSeconds() {
    return function is_s(secs: string): secs is 'ss' {
        if (!secs.length || secs.length > 2) return false;
        const numberSeconds = Number(secs);
        if (isNaN(numberSeconds)) return false;
        return numberSeconds >= 0 && numberSeconds <= 59;
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isSecondsWithMs(utl: JITUtils) {
    const isS = utl.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
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
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isTimeString_ISO_TZ(utl: JITUtils) {
    const isTWms = utl.getPureFn('isTimeString_ISO') as ReturnType<typeof isTimeString_ISO>;
    const isTZ = utl.getPureFn('isTimeZone') as ReturnType<typeof isTimeZone>;
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
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isTimeString_ISO(utl: JITUtils) {
    const isH = utl.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = utl.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isSWithMls = utl.getPureFn('isSecondsWithMs') as ReturnType<typeof isSecondsWithMs>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSWithMls(parts[2]);
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isTimeString_HHmmss(utl: JITUtils) {
    const isH = utl.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = utl.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isS = utl.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isTimeString_HHmm(utl: JITUtils) {
    const isH = utl.getPureFn('isHours') as ReturnType<typeof isHours>;
    const isM = utl.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
    } satisfies GenericPureFunction<TimeStringParams>;
}

/** @reflection never */
export function isTimeString_mmss(utl: JITUtils) {
    const isM = utl.getPureFn('isMinutes') as ReturnType<typeof isMinutes>;
    const isS = utl.getPureFn('isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
    } satisfies GenericPureFunction<TimeStringParams>;
}

// ######### Registering the time validator #########
// must be register in correct order so dependencies are available
const pureTimeFns = [isTimeZone, isHours, isMinutes, isSeconds, isSecondsWithMs];
registerPureFunctionGroupWithCtx(pureTimeFns);
registerPureFunctionWithCtx(isTimeString_ISO_TZ, pureTimeFns);
registerPureFunctionWithCtx(isTimeString_ISO, pureTimeFns);
registerPureFunctionWithCtx(isTimeString_HHmmss, pureTimeFns);
registerPureFunctionWithCtx(isTimeString_HHmm, pureTimeFns);
registerPureFunctionWithCtx(isTimeString_mmss, pureTimeFns);
export const timeStringValidator = registerFormatter(new TimeStringFormat());
