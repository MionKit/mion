/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {anyValuesList, mockRegExpsList, stringCharSet} from './constants';

export function mockBoolean(): boolean {
    return Math.random() < 0.5;
}

export function mockBigInt(min = 0, max = 10000): bigint {
    return BigInt(random(min, max));
}

export function mockString(length = random(0, 30), charSet = stringCharSet): string {
    return Array.from({length}, () => charSet[random(0, charSet.length - 1)]).join('');
}

export function mockSymbol(name?: string, length?: number, charsSet?: string): symbol {
    const symbolName = name ?? mockString(length, charsSet);
    return Symbol(symbolName);
}

export function mockRegExp(list = mockRegExpsList): RegExp {
    return list[random(0, list.length - 1)];
}

export function mockNumber(min = 0, max = 10000): number {
    if (min > max) {
        throw new Error('min cannot be greater than max');
    }
    return random(min, max);
}

export function mockDate(minDate: Date | number = new Date(0), maxDate: Date | number = new Date()): Date {
    const min = typeof minDate === 'number' ? minDate : minDate.getTime();
    const max = typeof maxDate === 'number' ? maxDate : maxDate.getTime();
    if (min > max) {
        throw new Error('minDate cannot be greater than maxDate');
    }
    return new Date(random(min, max));
}

export function mockAny(anyList = anyValuesList): any {
    return anyList[random(0, anyList.length - 1)];
}

/** Generates a random number between min and max, both inclusive */
export function random(min: number = 0, max = 10000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function mockRecursiveEmptyArray(depth: number, length: number) {
    if (depth === 0) return [];
    return Array.from({length}, () => mockRecursiveEmptyArray(depth - 1, length));
}
