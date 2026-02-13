/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * This file contains all pure functions used by type-formats.
 * Pure functions are registered here and can be imported from this single file.
 * This makes it easier to export and use pure functions in AOT compilation.
 */

import {
    type JITUtils,
    GenericPureFunction,
    TypeFormatError,
    registerPureFnClosure,
    registerPureFnClosuresGroup,
    FormatParams_Date,
    FormatParams_Time,
    FormatParams_UUID,
    FormatParams_IP,
} from '@mionkit/core';

// ############### Date Pure Functions ###############

/** @reflection never */
export function isDateString() {
    // check is a valid date taking into account leap years
    return function is_date_string(year: string | undefined, month: string, day?: string): boolean {
        let y: undefined | number = undefined;
        if (year) {
            if (year.length !== 4) return false;
            y = Number(year);
            if (isNaN(y)) return false;
            if (y < 0 || y > 9999) return false;
        }
        if (month.length !== 2) return false;
        const m = Number(month);
        if (isNaN(m)) return false;
        if (m < 1 || m > 12) return false;
        if (day) {
            if (day.length !== 2) return false;
            const d = Number(day);
            if (isNaN(d)) return false;
            if (d < 1 || d > 31) return false;
            // check for leap years
            if (m === 2) {
                if (d > 29) return false;
                if (y && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return false;
            } else if ((m === 4 || m === 6 || m === 9 || m === 11) && d > 30) {
                return false;
            }
        }
        return true;
    };
}

/** @reflection never */
export function isDateString_YMD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_DMY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_MDY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_YM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_MD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_DM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('mionFormats', 'isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** Date pure functions array for registration */
export const dateFunctions = [
    isDateString,
    isDateString_YMD,
    isDateString_DMY,
    isDateString_MDY,
    isDateString_YM,
    isDateString_MD,
    isDateString_DM,
];

// ############### Time Pure Functions ###############

/** @reflection never */
export function isTimeZone(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('mionFormats', 'isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('mionFormats', 'isMinutes') as ReturnType<typeof isMinutes>;
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
    const isS = jUtil.getPureFn('mionFormats', 'isSeconds') as ReturnType<typeof isSeconds>;
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
    const isTWms = jUtil.getPureFn('mionFormats', 'isTimeString_ISO') as ReturnType<typeof isTimeString_ISO>;
    const isTZ = jUtil.getPureFn('mionFormats', 'isTimeZone') as ReturnType<typeof isTimeZone>;
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
    const isH = jUtil.getPureFn('mionFormats', 'isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('mionFormats', 'isMinutes') as ReturnType<typeof isMinutes>;
    const isSWithMls = jUtil.getPureFn('mionFormats', 'isSecondsWithMs') as ReturnType<typeof isSecondsWithMs>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSWithMls(parts[2]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_HHmmss(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('mionFormats', 'isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('mionFormats', 'isMinutes') as ReturnType<typeof isMinutes>;
    const isS = jUtil.getPureFn('mionFormats', 'isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_HHmm(jUtil: JITUtils) {
    const isH = jUtil.getPureFn('mionFormats', 'isHours') as ReturnType<typeof isHours>;
    const isM = jUtil.getPureFn('mionFormats', 'isMinutes') as ReturnType<typeof isMinutes>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** @reflection never */
export function isTimeString_mmss(jUtil: JITUtils) {
    const isM = jUtil.getPureFn('mionFormats', 'isMinutes') as ReturnType<typeof isMinutes>;
    const isS = jUtil.getPureFn('mionFormats', 'isSeconds') as ReturnType<typeof isSeconds>;
    return function is_iso_time(value: string): boolean {
        const parts = value.split(':');
        return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
    } satisfies GenericPureFunction<FormatParams_Time>;
}

/** Base time pure functions (dependencies for other time functions) */
export const pureTimeFns = [isTimeZone, isHours, isMinutes, isSeconds, isSecondsWithMs];

/** Time format pure functions */
export const timeFunctions = [isTimeString_ISO_TZ, isTimeString_ISO, isTimeString_HHmmss, isTimeString_HHmm, isTimeString_mmss];

// ############### UUID Pure Functions ###############

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

// ############### IP Pure Functions ###############

/** @reflection never */
export function isLocalHost() {
    const lhr = /^localhost$/i;
    return function is_local_host(ip: string, p: FormatParams_IP): boolean {
        if (p.version === 4) return lhr.test(ip) || ip === '127:0:0:1';
        if (p.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
        return lhr.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    };
}

/** @reflection never */
export function isIPV4(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('mionFormats', 'isLocalHost') as ReturnType<typeof isLocalHost>;
    function get_address(ip: string, p: FormatParams_IP): false | string {
        if (!p.allowPort) return ip;
        const parts = ip.split(':');
        if (parts.length > 2) return false;
        const [address, portS] = parts;
        if (!portS) return address;
        const port = Number(portS);
        if (isNaN(port) || port < 0 || port > 65535) return false;
        return address;
    }
    return function is_ip_v4(ip: string, p: FormatParams_IP): boolean {
        const address = get_address(ip, p);
        if (address === false) return false;
        const isLocal = is_Localhost(address, p);
        if (p.allowLocalHost && isLocal) return true;
        if (!p.allowLocalHost && isLocal) return false;
        const sections = address.split('.');
        if (sections.length !== 4) return false;
        for (const section of sections) {
            const num = Number(section);
            if (isNaN(num) || num < 0 || num > 255) return false;
        }
        return true;
    } as GenericPureFunction<FormatParams_IP>;
}

/** @reflection never */
export function isIPV6(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('mionFormats', 'isLocalHost') as ReturnType<typeof isLocalHost>;
    const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
    function get_address(ip: string, p: FormatParams_IP): false | string {
        if (!p.allowPort) return ip;
        const match = ip.match(ipv6PortRegexp);
        if (!match) return false;
        const address = match[1];
        const port = match[2];
        if (!port) return address;
        const num = Number(port);
        if (isNaN(num) || num < 0 || num > 65535) return false;
        return address;
    }
    return function is_ip_v6(ip: string, p: FormatParams_IP): boolean {
        const address = get_address(ip, p);
        if (address === false) return false;
        const isLocal = is_Localhost(address, p);
        if (p.allowLocalHost && isLocal) return true;
        if (!p.allowLocalHost && isLocal) return false;
        const sections = address.split(':');
        if (sections.length < 3 || sections.length > 8) return false;
        let doubleColon = 0;
        for (const section of sections) {
            if (section.length === 0) {
                doubleColon++;
                if (doubleColon > 1) return false;
                continue; // Allow empty sections for "::"
            }
            if (section.length > 4) return false;
            const num = parseInt(section, 16);
            if (isNaN(num) || num < 0 || num > 0xffff) return false;
        }
        return true;
    } as GenericPureFunction<FormatParams_IP>;
}

/** @reflection never */
export function mionGetIPErrors(utl: JITUtils) {
    const is_ip_v4 = utl.getPureFn('mionFormats', 'isIPV4') as ReturnType<typeof isIPV4>;
    const is_ip_v6 = utl.getPureFn('mionFormats', 'isIPV6') as ReturnType<typeof isIPV6>;
    const noopDeps = {};
    return function get_ip_errors(
        ip: string,
        p: FormatParams_IP,
        fPath: (string | number)[],
        fErrs: TypeFormatError[],
        name = 'ip'
    ): TypeFormatError[] {
        if (p.version === 4 && !is_ip_v4(ip, p, noopDeps))
            return (fErrs.push({name, formatPath: [...fPath, 'version'], val: 4}), fErrs);
        if (p.version === 6 && !is_ip_v6(ip, p, noopDeps))
            return (fErrs.push({name, formatPath: [...fPath, 'version'], val: 6}), fErrs);
        const isIP = is_ip_v4(ip, p, noopDeps) || is_ip_v6(ip, p, noopDeps);
        if (!isIP) fErrs.push({name, formatPath: ['version'], val: 'any'});
        return fErrs;
    };
}

/** IP pure functions array */
export const ipFunctions = [isLocalHost, isIPV4, isIPV6, mionGetIPErrors];

// ############### Register All Pure Functions ###############

// Date functions registration
registerPureFnClosure('mionFormats', isDateString);
registerPureFnClosure('mionFormats', isDateString_YMD, [isDateString]);
registerPureFnClosure('mionFormats', isDateString_DMY, [isDateString]);
registerPureFnClosure('mionFormats', isDateString_MDY, [isDateString]);
registerPureFnClosure('mionFormats', isDateString_YM, [isDateString]);
registerPureFnClosure('mionFormats', isDateString_MD, [isDateString]);
registerPureFnClosure('mionFormats', isDateString_DM, [isDateString]);

// Time functions registration - must be registered in correct order so dependencies are available
registerPureFnClosuresGroup('mionFormats', pureTimeFns);
registerPureFnClosure('mionFormats', isTimeString_ISO_TZ, pureTimeFns);
registerPureFnClosure('mionFormats', isTimeString_ISO, pureTimeFns);
registerPureFnClosure('mionFormats', isTimeString_HHmmss, pureTimeFns);
registerPureFnClosure('mionFormats', isTimeString_HHmm, pureTimeFns);
registerPureFnClosure('mionFormats', isTimeString_mmss, pureTimeFns);

// UUID functions registration
registerPureFnClosure('mionFormats', isUUID);

// IP functions registration
registerPureFnClosure('mionFormats', isLocalHost);
registerPureFnClosure('mionFormats', isIPV4, [isLocalHost]);
registerPureFnClosure('mionFormats', isIPV6, [isLocalHost]);

// ############### All Pure Functions Export ###############

/** All mionFormats pure functions for easy export */
export const mionFormatsPureFunctions = [
    // Date functions
    ...dateFunctions,
    // Time functions
    ...pureTimeFns,
    ...timeFunctions,
    // UUID functions
    isUUID,
    // IP functions
    ...ipFunctions,
];
