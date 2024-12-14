/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CompiledOperation} from '../types';

// Validate DATE Time format: YYYY-MM-DDTHH:MM:SS
export function fm_isDateTime(str: string): boolean {
    if (str.length != 19 || str[10] !== 'T') return false;
    const isDate = fm_isDate(str.substring(0, 10));
    const isTime = fm_isTime(str.substring(11, 19));
    return isDate && isTime;
}

// Validate Date format: YYYY-MM-DD
export function fm_isDate(str: string): boolean {
    if (str.length !== 10) return false;
    if (str[4] !== '-' || str[7] !== '-') return false;
    const year = parseInt(str.substring(0, 4), 10);
    const month = parseInt(str.substring(5, 7), 10);
    const day = parseInt(str.substring(8, 10), 10);
    // valid date
    if (month < 1 || month > 12) return false;
    const daysInMonth = [31, fm_isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month - 1]) return false;
    return true;
}

// Validate Time format: HH:MM:SS
export function fm_isTime(str: string): boolean {
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

export function fm_isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Email validation functions
export function fm_isEmail(str: string): boolean {
    if (str.length > 256) return false;
    const atIndex = str.indexOf('@');
    if (atIndex <= 0 || atIndex !== str.lastIndexOf('@') || atIndex === str.length - 1) return false;
    const localPart = str.substring(0, atIndex);
    const domainPart = str.substring(atIndex + 1);
    const allowedLocalChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-';
    for (let i = 0; i < localPart.length; i++) {
        if (!allowedLocalChars.includes(localPart[i])) return false;
    }
    if (!fm_isDomain(domainPart)) return false;
    return true;
}

export function fm_isDomain(domain: string): boolean {
    const domainParts = domain.split('.');
    if (domainParts.length < 2) return false;
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) return false;
    const domainRegex = /^[a-zA-Z0-9-]+$/;
    for (const part of domainParts) {
        if (!domainRegex.test(part)) return false;
    }
    return true;
}

export function isEmailRFC5322Lite(str: string): boolean {
    if (str.length > 256) return false;
    const atIndex = str.indexOf('@');
    if (atIndex <= 0 || atIndex >= str.length - 1) return false;
    const localPart = str.substring(0, atIndex);
    const domainPart = str.substring(atIndex + 1);

    const allowedLocalChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+/=?^_`{|}~-";

    // Validate local part
    for (let i = 0; i < localPart.length; i++) {
        if (!allowedLocalChars.includes(localPart[i])) return false;
    }

    // Validate domain part
    if (!isValidDomainRFC5322Lite(domainPart)) return false;

    return true;
}

export function isValidDomainRFC5322Lite(domain: string): boolean {
    const domainParts = domain.split('.');
    if (domainParts.length === 0) return false;
    const allowedDomainChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

    for (const part of domainParts) {
        if (part.length === 0) return false;
        for (let i = 0; i < part.length; i++) {
            if (!allowedDomainChars.includes(part[i])) return false;
        }
    }
    return true;
}

export function isEmailStrict(str: string): boolean {
    if (str.length > 256) return false;
    const atIndex = str.indexOf('@');
    if (atIndex <= 0 || atIndex >= str.length - 1 || atIndex !== str.lastIndexOf('@')) return false;
    const localPart = str.substring(0, atIndex);
    const domainPart = str.substring(atIndex + 1);

    // Local part must not start or end with dot, and dots cannot be consecutive
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;

    const allowedLocalChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&'*+/=?^_`{|}~-.";

    // Validate local part
    for (let i = 0; i < localPart.length; i++) {
        if (!allowedLocalChars.includes(localPart[i])) return false;
    }

    // Validate domain part with stricter rules
    if (!isValidDomainStrict(domainPart)) return false;

    return true;
}

export function isValidDomainStrict(domain: string): boolean {
    const domainParts = domain.split('.');
    if (domainParts.length < 2) return false;
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) return false;
    const allowedDomainChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

    for (const part of domainParts) {
        if (part.length === 0 || part.startsWith('-') || part.endsWith('-')) return false;
        for (let i = 0; i < part.length; i++) {
            if (!allowedDomainChars.includes(part[i])) return false;
        }
    }
    return true;
}

export function isEmailRFC5322(str: string): boolean {
    if (str.length > 256) return false;
    const atIndex = str.indexOf('@');
    if (atIndex <= 0 || atIndex >= str.length - 1) return false;
    const localPart = str.substring(0, atIndex);
    const domainPart = str.substring(atIndex + 1);

    if (!isValidLocalPartRFC5322(localPart)) return false;
    if (!isValidDomainRFC5322(domainPart)) return false;

    return true;
}

export function isValidLocalPartRFC5322(local: string): boolean {
    if (local.startsWith('"') && local.endsWith('"')) {
        // Quoted string, allow any character except unescaped quotes and line breaks
        for (let i = 1; i < local.length - 1; i++) {
            const char = local[i];
            if (char === '"' && local[i - 1] !== '\\') return false;
            if (char === '\r' || char === '\n') return false;
        }
    } else {
        // Unquoted string
        const allowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&'*+/=?^_`{|}~-.";
        for (let i = 0; i < local.length; i++) {
            const char = local[i];
            if (!allowedChars.includes(char)) return false;
            if (char === '.' && (i === 0 || i === local.length - 1 || local[i - 1] === '.')) return false;
        }
    }
    return true;
}

export function isValidDomainRFC5322(domain: string): boolean {
    const domainParts = domain.split('.');
    if (domainParts.length === 0) return false;
    const allowedDomainChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

    for (const part of domainParts) {
        if (part.length === 0) return false;
        for (let i = 0; i < part.length; i++) {
            if (!allowedDomainChars.includes(part[i])) return false;
        }
    }
    return true;
}

// Internet validation functions

export function isDomain(str: string): boolean {
    const labels = str.split('.');
    if (labels.length === 0) return false;
    const labelRegex = /^[a-zA-Z0-9-]+$/;

    for (const label of labels) {
        if (label.length === 0 || label.length > 63) return false;
        if (!labelRegex.test(label)) return false;
        if (label.startsWith('-') || label.endsWith('-')) return false;
    }
    return true;
}

export function isURL(str: string): boolean {
    if (str.length > 2048) return false;
    if (!str.startsWith('http://') && !str.startsWith('https://')) return false;
    const urlPart = str.substring(str.indexOf('://') + 3);
    if (urlPart.length === 0 || urlPart.startsWith('/')) return false;
    if (urlPart.includes(' ')) return false;
    // Additional checks for domain and path can be added as needed
    return true;
}

export function isURLExtended(str: string): boolean {
    if (str.length > 2048) return false;
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
    // Additional validation can be added as necessary
    return true;
}

export function isPhone(str: string): boolean {
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

export function isIP(str: string): boolean {
    return isIPv4(str) || isIPv6(str);
}

export function isIPv4(str: string): boolean {
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

export function isIPv6(str: string): boolean {
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

export function isIPv4Range(str: string): boolean {
    if (str.length < 9 || str.length > 18) return false;
    const [ip, range] = str.split('/');
    if (!range || !isIPv4(ip)) return false;
    const rangeNum = parseInt(range, 10);
    return rangeNum >= 0 && rangeNum <= 32;
}

// IDs validation functions

export function isUUID(str: string): boolean {
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

// EXPORT VALIDATORS AS COMPILED OPERATIONS
// this we can use them in jit code but we really don't need to compile them
// IMPORTANT: for this to work functions must be pure and have no side effects,no imports, no using external variables, etc.
// otherwise the compiled code will break. we need to implement a way to register these functions that ensures they won't break.

export const isUTCTime: CompiledOperation = {
    fn: fm_isDateTime,
    fnId: fm_isDateTime.name,
    args: {vλl: 'str'},
    defaultParamValues: {},
    code: fm_isDateTime.toString(),
    contextCode: '',
    jitFnHash: '',
    jitId: '',
    directDependencies: new Set(),
    childDependencies: new Set(),
};
