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
import {compilePureFunctionCall, registerFormatter, registerPureFunctionWithCtx} from '../lib/formats';
import {JITUtils} from '../lib/jitUtils';

export type DateStringParams = {
    format: 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'MM-DD' | 'DD-MM' | 'YYYY-MM';
};

export type DefaultDateParams = {format: 'ISO'};

export type DateString<P extends Partial<DateStringParams> = DefaultDateParams> = TypeFormat<
    string,
    typeof DateStringValidator.id,
    P
>;

// Date validator
export class DateStringValidator extends JitRunTypeFormatter<DateStringParams> {
    static id = 'date' as const;
    kind = ReflectionKind.string;
    name = DateStringValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const formatFn = this.getFormatPureFn(params.format);
        return compilePureFunctionCall(comp, rt, this, formatFn).callCode;
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
        const year = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        switch (params.format) {
            case 'ISO':
            case 'YYYY-MM-DD':
                return `${year}-${month}-${day}`;
            case 'DD-MM-YYYY':
                return `${day}-${month}-${year}`;
            case 'MM-DD-YYYY':
                return `${month}-${day}-${year}`;
            case 'YYYY-MM':
                return `${year}-${month}`;
            case 'MM-DD':
                return `${month}-${day}`;
            case 'DD-MM':
                return `${day}-${month}`;
            default:
                throw new Error(`Invalid date format: ${params.format}`);
        }
    }
    _compileFormat?; // no format needed
    getFormatPureFn(format) {
        switch (format) {
            case 'ISO':
            case 'YYYY-MM-DD':
                return isDateString_YMD;
            case 'DD-MM-YYYY':
                return isDateString_DMY;
            case 'MM-DD-YYYY':
                return isDateString_MDY;
            case 'YYYY-MM':
                return isDateString_YM;
            case 'MM-DD':
                return isDateString_MD;
            case 'DD-MM':
                return isDateString_DM;
            default:
                throw new Error(`Invalid date format: ${format}`);
        }
    }
}

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
export function isDateString_YMD(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
    } satisfies GenericPureFunction<DateStringParams>;
}

/** @reflection never */
export function isDateString_DMY(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
    } satisfies GenericPureFunction<DateStringParams>;
}

/** @reflection never */
export function isDateString_MDY(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
    } satisfies GenericPureFunction<DateStringParams>;
}

/** @reflection never */
export function isDateString_YM(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(parts[0], parts[1]);
    } satisfies GenericPureFunction<DateStringParams>;
}

/** @reflection never */
export function isDateString_MD(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
    } satisfies GenericPureFunction<DateStringParams>;
}

/** @reflection never */
export function isDateString_DM(utl: JITUtils) {
    const isDate = utl.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
    } satisfies GenericPureFunction<DateStringParams>;
}

// ######### Registering the date validator #########
registerPureFunctionWithCtx(isDateString);
registerPureFunctionWithCtx(isDateString_YMD, [isDateString]);
registerPureFunctionWithCtx(isDateString_DMY, [isDateString]);
registerPureFunctionWithCtx(isDateString_MDY, [isDateString]);
registerPureFunctionWithCtx(isDateString_YM, [isDateString]);
registerPureFunctionWithCtx(isDateString_MD, [isDateString]);
registerPureFunctionWithCtx(isDateString_DM, [isDateString]);
export const dateStringValidator = registerFormatter(new DateStringValidator());
export const dateFunctions = [
    isDateString,
    isDateString_YMD,
    isDateString_DMY,
    isDateString_MDY,
    isDateString_YM,
    isDateString_MD,
    isDateString_DM,
];
