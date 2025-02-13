/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitValidator, RunTypeError} from '../types';

export type StringParams = {
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;

    // bellow are more transformer than Validators
    // toLowercase?: boolean;
    // toUppercase?: boolean;
    // capitalize?: boolean;
    // unCapitalize?: boolean;
};

// maxLength validator
export const stringMaxLengthValidator = {
    name: 'maxLength',
    isType(vλl: string): boolean {
        return typeof vλl === 'string';
    },
    typeErrors(vλl: string): RunTypeError[] {
        return vλl as any;
    },
} satisfies JitValidator;

// minLength validator
export const stringMinLengthValidator = {
    name: 'minLength',
    isType(vλl: string): boolean {
        return typeof vλl === 'string';
    },
    typeErrors(vλl: string): RunTypeError[] {
        return vλl as any;
    },
} satisfies JitValidator;

// length validator
export const stringLengthValidator = {
    name: 'minLength',
    isType(vλl: string): boolean {
        return typeof vλl === 'string';
    },
    typeErrors(vλl: string): RunTypeError[] {
        return vλl as any;
    },
} satisfies JitValidator;

// pattern validator
export const stringPatternValidator = {
    name: 'minLength',
    isType(vλl: string): boolean {
        return typeof vλl === 'string';
    },
    typeErrors(vλl: string): RunTypeError[] {
        return vλl as any;
    },
} satisfies JitValidator;
