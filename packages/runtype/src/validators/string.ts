/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitRunTypeValidator} from '../lib/types';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

export type StringValidatorParams = {
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;
};

// maxLength validator
export const stringMaxLengthValidator = {
    kind: ReflectionKind.string,
    name: 'maxLength',
    _compileIsType(comp, rt): string {
        const typeParam = rt.getBrandedTypeParamValue(this.name, 'number') as number;
        return `${comp.vλl}.length <= ${typeParam}`;
    },
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    },
} satisfies JitRunTypeValidator;

// minLength validator
export const stringMinLengthValidator = {
    kind: ReflectionKind.string,
    name: 'minLength',
    _compileIsType(comp, rt): string {
        const typeParam = rt.getBrandedTypeParamValue(this.name, 'number') as number;
        return `${comp.vλl}.length >= ${typeParam}`;
    },
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    },
} satisfies JitRunTypeValidator;

// length validator
export const stringLengthValidator = {
    kind: ReflectionKind.string,
    name: 'length',
    _compileIsType(comp, rt): string {
        const typeParam = rt.getBrandedTypeParamValue(this.name, 'number') as number;
        return `${comp.vλl}.length === ${typeParam}`;
    },
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    },
} satisfies JitRunTypeValidator;

// pattern validator
export const stringPatternValidator = {
    kind: ReflectionKind.string,
    name: 'pattern',
    _compileIsType(comp, rt): string {
        const typeParam = rt.getBrandedTypeParamValue(this.name, 'number') as number;
        return `${comp.vλl}.match(${typeParam})`;
    },
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    },
} satisfies JitRunTypeValidator;
