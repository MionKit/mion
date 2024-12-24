/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {jitUtils, type JITUtils} from '../lib/jitUtils';
import {CompiledOperation} from '../types';

export const validatorNames = {
    isDate: 'vf_isDate',
    isTime: 'vf_isTime',
    isDateTime: 'vf_isDateTime',
    isEmail: 'vf_isEmail',
    isDomain: 'vf_isDomain',
    isURL: 'vf_isURL',
    isURLExtended: 'vf_isURLExtended',
    isPhone: 'vf_isPhone',
    isIP: 'vf_isIP',
    isIPv4: 'vf_isIPv4',
    isIPv6: 'vf_isIPv6',
    isIPv4Range: 'vf_isIPv4Range',
    isUUID: 'vf_isUUID',
    isEmailRFC5322Lite: 'vf_isEmailRFC5322Lite',
    isValidDomainRFC5322Lite: 'vf_isValidDomainRFC5322Lite',
    isEmailStrict: 'vf_isEmailStrict',
    isValidDomainStrict: 'vf_isValidDomainStrict',
    isEmailRFC5322: 'vf_isEmailRFC5322',
    isValidLocalPartRFC5322: 'vf_isValidLocalPartRFC5322',
    isValidDomainRFC5322: 'vf_isValidDomainRFC5322',
};

/**
 * Validate a string as a time in the format HH:MM:SS
 */
function isTimeWithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isTime(str: string): boolean {
        if (str.length !== 8) return false;
        if (str[2] !== ':' || str[5] !== ':') return false;
        const hour = parseInt(str.substring(0, 2), 10);
        const minute = parseInt(str.substring(3, 5), 10);
        const second = parseInt(str.substring(6, 8), 10);
        // valid time
        if (hour < 0 || hour > 23) return false;
        if (minute < 0 || minute > 59) return false;
        if (second < 0 || second > 59) return false;
        return true;
    }
    return vf_isTime;
}

function isDateWithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isDate(str: string): boolean {
        if (str.length !== 10) return false;
        if (str[4] !== '-' || str[7] !== '-') return false;
        const year = parseInt(str.substring(0, 4), 10);
        const month = parseInt(str.substring(5, 7), 10);
        const day = parseInt(str.substring(8, 10), 10);
        // valid date
        if (month < 1 || month > 12) return false;
        const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (day < 1 || day > daysInMonth[month - 1]) return false;
        return true;
    }
    return vf_isDate;
}

function isDateTimeWithContext(utl: JITUtils): (str: string) => boolean {
    const vf_isDate = utl.getJIT('vf_isDate')!;
    const vf_isTime = utl.getJIT('vf_isTime')!;
    function vf_isDateTime(str: string): boolean {
        if (str.length != 19 || str[10] !== 'T') return false;
        const isDate = vf_isDate.fn(str.substring(0, 10));
        const isTime = vf_isTime.fn(str.substring(11, 19));
        return isDate && isTime;
    }
    return vf_isDateTime;
}

function isDomainWithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isDomain(str: string): boolean {
        const domainParts = str.split('.');
        if (domainParts.length === 0) return false;
        const domainRegex = /^[a-zA-Z0-9-]+$/;
        for (const part of domainParts) {
            if (!domainRegex.test(part)) return false;
        }
        return true;
    }
    return vf_isDomain;
}

function isEmailWithContext(utl: JITUtils): (str: string, maxLength: number) => boolean {
    const vf_isDomain = utl.getJIT('vf_isDomain')!;
    const allowedLocalChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-';
    function vf_isEmail(str: string, maxLength: number, allowedLocal?: string): boolean {
        if (str.length > maxLength) return false;
        const atIndex = str.indexOf('@');
        if (atIndex <= 0 || atIndex !== str.lastIndexOf('@') || atIndex === str.length - 1) return false;
        const localPart = str.substring(0, atIndex);
        const domainPart = str.substring(atIndex + 1);
        const allowedChars = allowedLocal || allowedLocalChars;
        for (let i = 0; i < localPart.length; i++) {
            if (!allowedChars.includes(localPart[i])) return false;
        }
        if (!vf_isDomain.fn(domainPart)) return false;
        return true;
    }
    return vf_isEmail;
}

function isURlWithContext(utl: JITUtils): (str: string, maxLength: number) => boolean {
    function vf_isURL(str: string, maxLength: number): boolean {
        if (str.length > maxLength) return false;
        if (!str.startsWith('http://') && !str.startsWith('https://')) return false;
        const urlPart = str.substring(str.indexOf('://') + 3);
        if (urlPart.length === 0 || urlPart.startsWith('/')) return false;
        if (urlPart.includes(' ')) return false;
        return true;
    }
    return vf_isURL;
}

function isURLExtendedWithContext(utl: JITUtils): (str: string, maxLength: number) => boolean {
    function vf_isURLExtended(str: string, maxLength: number): boolean {
        if (str.length > maxLength) return false;
        const protocols = ['http://', 'https://', 'ftp://', 'file://', 'mailto:', 'data:'];
        let matchesProtocol = false;
        for (const protocol of protocols) {
            if (str.startsWith(protocol)) {
                matchesProtocol = true;
                break;
            }
        }
        if (!matchesProtocol) return false;
        if (str.includes(' ')) return false;
        return true;
    }
    return vf_isURLExtended;
}

function isPhoneWithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isPhone(str: string): boolean {
        if (str.length < 4 || str.length > 17) return false;
        let index = 0;
        if (str.startsWith('+')) index++;
        let digitCount = 0;
        for (; index < str.length; index++) {
            const ch = str[index];
            if (ch >= '0' && ch <= '9') {
                digitCount++;
            } else if (ch === '-' && index !== 0 && index !== str.length - 1) {
                continue;
            } else {
                return false;
            }
        }
        return digitCount >= 4 && digitCount <= 17;
    }
    return vf_isPhone;
}

function isIPv4WithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isIPv4(str: string): boolean {
        if (str.length < 7 || str.length > 15) return false;
        const segments = str.split('.');
        if (segments.length !== 4) return false;
        for (const segment of segments) {
            if (segment.length === 0 || segment.length > 3) return false;
            if (!/^\d+$/.test(segment)) return false;
            const num = parseInt(segment, 10);
            if (num < 0 || num > 255) return false;
            if (segment.length > 1 && segment.startsWith('0')) return false;
        }
        return true;
    }
    return vf_isIPv4;
}

function isIPv6WithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isIPv6(str: string): boolean {
        if (str.length < 2 || str.length > 39) return false;
        const segments = str.split(':');
        if (segments.length > 8) return false;
        let hasEmptySegment = false;
        const hexRegex = /^[0-9a-fA-F]{0,4}$/;
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (segment.length === 0) {
                if (hasEmptySegment) return false;
                hasEmptySegment = true;
                continue;
            }
            if (!hexRegex.test(segment)) return false;
        }
        return true;
    }
    return vf_isIPv6;
}

function isIpWithContext(utl: JITUtils): (str: string) => boolean {
    const vf_isIPv4 = utl.getJIT('vf_isIPv4')!;
    const vf_isIPv6 = utl.getJIT('vf_isIPv6')!;
    function vf_isIP(str: string): boolean {
        return vf_isIPv4.fn(str) || vf_isIPv6.fn(str);
    }
    return vf_isIP;
}

function isIPv4RangeWithContext(utl: JITUtils): (str: string) => boolean {
    const vf_isIPv4 = utl.getJIT('vf_isIPv4')!;
    function vf_isIPv4Range(str: string): boolean {
        if (str.length < 9 || str.length > 18) return false;
        const [ip, range] = str.split('/');
        if (!range || !vf_isIPv4.fn(ip)) return false;
        const rangeNum = parseInt(range, 10);
        return rangeNum >= 0 && rangeNum <= 32;
    }
    return vf_isIPv4Range;
}

function isUUIDWithContext(utl: JITUtils): (str: string) => boolean {
    function vf_isUUID(str: string): boolean {
        if (str.length !== 36) return false;
        const parts = str.split('-');
        if (parts.length !== 5) return false;
        if (
            parts[0].length !== 8 ||
            parts[1].length !== 4 ||
            parts[2].length !== 4 ||
            parts[3].length !== 4 ||
            parts[4].length !== 12
        ) {
            return false;
        }
        const hexRegex = /^[0-9a-fA-F]+$/;
        for (const part of parts) {
            if (!hexRegex.test(part)) return false;
        }
        return true;
    }
    return vf_isUUID;
}

export const isTime: CompiledOperation = {
    fn: isTimeWithContext(jitUtils),
    fnId: validatorNames.isTime,
    jitFnHash: validatorNames.isTime,
    jitId: validatorNames.isTime,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isTimeWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isDate: CompiledOperation = {
    fn: isDateWithContext(jitUtils),
    fnId: validatorNames.isDate,
    jitFnHash: validatorNames.isDate,
    jitId: validatorNames.isDate,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isDateWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isDateTime: CompiledOperation = {
    fn: isDateTimeWithContext(jitUtils),
    fnId: validatorNames.isDateTime,
    jitFnHash: validatorNames.isDateTime,
    jitId: validatorNames.isDateTime,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: '',
    dependenciesSet: new Set([validatorNames.isDate, validatorNames.isTime]),
};

export const isDomain: CompiledOperation = {
    fn: isDomainWithContext(jitUtils),
    fnId: validatorNames.isDomain,
    jitFnHash: validatorNames.isDomain,
    jitId: validatorNames.isDomain,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isDomainWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isEmail: CompiledOperation = {
    fn: isEmailWithContext(jitUtils),
    fnId: validatorNames.isEmail,
    jitFnHash: validatorNames.isEmail,
    jitId: validatorNames.isEmail,
    args: {vλl: 'str', maxLength: 'number'},
    defaultParamValues: {maxLength: 256},
    code: isEmailWithContext.toString(),
    dependenciesSet: new Set([validatorNames.isDomain]),
};

export const isURL: CompiledOperation = {
    fn: isURlWithContext(jitUtils),
    fnId: validatorNames.isURL,
    jitFnHash: validatorNames.isURL,
    jitId: validatorNames.isURL,
    args: {vλl: 'str', maxLength: 'number'},
    defaultParamValues: {maxLength: 2048},
    code: isURlWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isURLExtended: CompiledOperation = {
    fn: isURLExtendedWithContext(jitUtils),
    fnId: validatorNames.isURLExtended,
    jitFnHash: validatorNames.isURLExtended,
    jitId: validatorNames.isURLExtended,
    args: {vλl: 'str', maxLength: 'number'},
    defaultParamValues: {maxLength: 2048},
    code: isURLExtendedWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isPhone: CompiledOperation = {
    fn: isPhoneWithContext(jitUtils),
    fnId: validatorNames.isPhone,
    jitFnHash: validatorNames.isPhone,
    jitId: validatorNames.isPhone,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isPhoneWithContext.toString(),
    dependenciesSet: new Set(),
};

export const isIP: CompiledOperation = {
    fn: isIpWithContext(jitUtils),
    fnId: validatorNames.isIP,
    jitFnHash: validatorNames.isIP,
    jitId: validatorNames.isIP,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: '',
    dependenciesSet: new Set([validatorNames.isIPv4, validatorNames.isIPv6]),
};

export const isIPv4: CompiledOperation = {
    fn: isIPv4WithContext(jitUtils),
    fnId: validatorNames.isIPv4,
    jitFnHash: validatorNames.isIPv4,
    jitId: validatorNames.isIPv4,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isIPv4WithContext.toString(),
    dependenciesSet: new Set(),
};

export const isIPv6: CompiledOperation = {
    fn: isIPv6WithContext(jitUtils),
    fnId: validatorNames.isIPv6,
    jitFnHash: validatorNames.isIPv6,
    jitId: validatorNames.isIPv6,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isIPv6WithContext.toString(),
    dependenciesSet: new Set(),
};

export const isIPv4Range: CompiledOperation = {
    fn: isIPv4RangeWithContext(jitUtils),
    fnId: validatorNames.isIPv4Range,
    jitFnHash: validatorNames.isIPv4Range,
    jitId: validatorNames.isIPv4Range,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isIPv4RangeWithContext.toString(),
    dependenciesSet: new Set([validatorNames.isIPv4]),
};

export const isUUID: CompiledOperation = {
    fn: isUUIDWithContext(jitUtils),
    fnId: validatorNames.isUUID,
    jitFnHash: validatorNames.isUUID,
    jitId: validatorNames.isUUID,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: isUUIDWithContext.toString(),
    dependenciesSet: new Set(),
};
