/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {MockOperation} from '../types';
import {JITUtils} from '../lib/jitUtils';
import {compilePureFunctionCall, registerFormatter, registerPureFunctionGroupWithCtx} from '../lib/formats';

export type TimeStringParams = {
    format: 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
};

export type ParsedTimeStringParams = TimeStringParams & {
    id: (typeof ForMatsIds)[keyof typeof ForMatsIds];
};

export const defaultTimeParams = {
    format: 'ISO',
} as const satisfies TimeStringParams;

export type TimeString<P extends Partial<TimeStringParams> = typeof defaultTimeParams> = TypeFormat<
    string,
    typeof TimeStringValidator.id,
    P
>;

// Time validator
export class TimeStringValidator extends JitRunTypeValidator<TimeStringParams> {
    static id = 'time' as const;
    kind = ReflectionKind.string;
    name = TimeStringValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultTimeParams);
        return compilePureFunctionCall(comp, rt, isTimeString, {format: params.format, id: ForMatsIds[params.format]});
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt, defaultTimeParams);
        const formatError = {name: this.name, invalid: {format: params.format}};
        return `if (!(${isTypeCode})) ${comp.callJitErr(rt, formatError)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt, defaultTimeParams);
        return mockTimeString({format: params.format, id: ForMatsIds[params.format]});
    }
}

// string formats ae mapped to number fos faster comparison
const ForMatsIds = {
    ISO: 0,
    'HH:mm:ss[.mmm]TZ': 1,
    'HH:mm:ss[.mmm]': 2,
    'HH:mm:ss': 3,
    'HH:mm': 4,
    'mm:ss': 5,
    HH: 6,
    mm: 7,
    ss: 8,
} as const;

export function parseTimeStringParams(params: TimeStringParams): ParsedTimeStringParams {
    return {...params, id: ForMatsIds[params.format]};
}

export function mockTimeString(params: ParsedTimeStringParams): string {
    const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
    const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    switch (params.id) {
        case 0: // ISO
        case 1: // 'HH:mm:ss[.mmm]TZ'
            return `${hours}:${minutes}:${seconds}${mockMilliseconds()}${mockTimeZone()}`;
        case 2: // 'HH:mm:ss[.mmm]'
            return `${hours}:${minutes}:${seconds}${mockMilliseconds()}`;
        case 3: // 'HH:mm:ss'
            return `${hours}:${minutes}:${seconds}`;
        case 4: // 'HH:mm'
            return `${hours}:${minutes}`;
        case 5: // 'mm:ss'
            return `${minutes}:${seconds}`;
        case 6: // 'HH'
            return hours;
        case 7: // 'mm'
            return minutes;
        case 8: // 'ss'
            return seconds;
        default:
            throw new Error(`Invalid time format: ${params.format}`);
    }
}

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

/**
 * Validates if a string is a time.
 * - Checks the the time is in the format HH:mm:ss
 * @param value
 * @reflection never
 */
export function isTimeString(ju: JITUtils) {
    const isTZ = ju.usePureFn('isTimeZoneString') as ReturnType<typeof isTimeZoneString>;
    const isH = ju.usePureFn('isHoursString') as ReturnType<typeof isHoursString>;
    const isM = ju.usePureFn('isMinutesString') as ReturnType<typeof isMinutesString>;
    const isS = ju.usePureFn('isSecondsString') as ReturnType<typeof isSecondsString>;
    const isSWithMls = ju.usePureFn('isSecondsWithMlsString') as ReturnType<typeof isSecondsWithMlsString>;
    return function is_time(value: string, p: ParsedTimeStringParams): boolean {
        if (p.id === 0 || p.id === 1) {
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
            return is_time(time, {format: 'HH:mm:ss[.mmm]', id: 2}) && isTZ(tz);
        }
        const parts = value.split(':');
        switch (p.id) {
            case 2: {
                // 'HH:mm:ss[.mmm]'
                return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSWithMls(parts[2]);
            }
            case 3: // 'HH:mm:ss'
                return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
            case 4: // 'HH:mm'
                return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
            case 5: // 'mm:ss'
                return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
            case 6: // 'HH'
                return parts.length === 1 && isH(parts[0]);
            case 7: // 'mm'
                return parts.length === 1 && isM(parts[0]);
            case 8: // 'ss'
                return parts.length === 1 && isS(parts[0]);
            default:
                throw new Error(`Invalid time format: ${p.format}`);
        }
    };
}
/** @reflection never */
export function isHoursString() {
    return function is_hours(hours: string): hours is 'HH' {
        if (!hours.length || hours.length > 2) return false;
        const numberHours = Number(hours);
        if (isNaN(numberHours)) return false;
        return numberHours >= 0 && numberHours <= 23;
    };
}
/** @reflection never */
export function isMinutesString() {
    return function is_minutes(mins: string): mins is 'mm' {
        if (!mins.length || mins.length > 2) return false;
        const numberMinutes = Number(mins);
        if (isNaN(numberMinutes)) return false;
        return numberMinutes >= 0 && numberMinutes <= 59;
    };
}
/** @reflection never */
export function isSecondsString() {
    return function is_seconds(secs: string): secs is 'ss' {
        if (!secs.length || secs.length > 2) return false;
        const numberSeconds = Number(secs);
        if (isNaN(numberSeconds)) return false;
        return numberSeconds >= 0 && numberSeconds <= 59;
    };
}
/** @reflection never */
export function isSecondsWithMlsString(ju: JITUtils) {
    const isS = ju.usePureFn('isSecondsString') as ReturnType<typeof isSecondsString>;
    return function is_seconds_with_millis(secsAnsMls: string): secsAnsMls is 'ss.mmm' {
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
    };
}
/** @reflection never */
export function isTimeZoneString(ju: JITUtils) {
    const isH = ju.usePureFn('isHoursString') as ReturnType<typeof isHoursString>;
    const isM = ju.usePureFn('isMinutesString') as ReturnType<typeof isMinutesString>;
    return function is_time_zone(timeZone: string): timeZone is 'TZ' {
        const isZ = timeZone === 'Z' || timeZone === 'z';
        if (isZ) return true;
        const tzParts = timeZone.split(':') as ['hh', 'mm'];
        if (tzParts.length !== 2) return false;
        const hours = tzParts[0];
        const minutes = tzParts[1];
        return isH(hours) && isM(minutes);
    };
}

// ######### Registering the time validator #########
// must be register in correct order so dependencies are available
registerPureFunctionGroupWithCtx([
    isTimeString,
    isHoursString,
    isMinutesString,
    isSecondsString,
    isSecondsWithMlsString,
    isTimeZoneString,
]);
export const timeStringValidator = registerFormatter(new TimeStringValidator());
