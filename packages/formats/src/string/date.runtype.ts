/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JITUtils, GenericPureFunction, FormatParam} from '@mionkit/core/src/types';
import {ReflectionKind} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {BaseRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {RunTypeOptions} from '@mionkit/run-types/src/types';
import {BaseRunTypeFormat} from '@mionkit/run-types/src/lib/baseRunTypeFormat';
import {registerFormatter, registerPureFnClosure} from '@mionkit/run-types/src/lib/formats';
import {TypeFormat} from '@mionkit/run-types/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {fpVal} from '@mionkit/run-types/src/lib/utils';
// Date validator
export class DateStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Date> {
    static id = 'date' as const;
    kind = ReflectionKind.string;
    name = DateStringRunTypeFormat.id;
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
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        const yy = Math.floor(Math.random() * 10000);
        const mm = Math.floor(Math.random() * 12) + 1;
        const dd = Math.floor(Math.random() * getMaxDaysInMonth(yy, mm)) + 1;
        const year = String(yy).padStart(4, '0');
        const month = String(mm).padStart(2, '0');
        const day = String(dd).padStart(2, '0');
        switch (fpVal(params.format)) {
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
                throw new Error(`Invalid date format: ${fpVal(params.format)}`);
        }
    }
    getFormatPureFn(format: DateFmt) {
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

/** return the max days in a month taking into account leap years */
function getMaxDaysInMonth(year: number, month: number): number {
    if (month === 2) {
        // check for leap years
        if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) return 29;
        return 28;
    }
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    return 31;
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
export function isDateString_YMD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_DMY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_MDY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_YM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_MD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function isDateString_DM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('isDateString') as any as ReturnType<typeof isDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

// ######### Registering the date validator #########

export const dateFunctions = [
    isDateString,
    isDateString_YMD,
    isDateString_DMY,
    isDateString_MDY,
    isDateString_YM,
    isDateString_MD,
    isDateString_DM,
];
registerPureFnClosure(isDateString);
registerPureFnClosure(isDateString_YMD, [isDateString]);
registerPureFnClosure(isDateString_DMY, [isDateString]);
registerPureFnClosure(isDateString_MDY, [isDateString]);
registerPureFnClosure(isDateString_YM, [isDateString]);
registerPureFnClosure(isDateString_MD, [isDateString]);
registerPureFnClosure(isDateString_DM, [isDateString]);

export const DATE_RUN_TYPE_FORMATTER = registerFormatter(new DateStringRunTypeFormat());

// ############### Run Types ###############

export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'MM-DD' | 'DD-MM' | 'YYYY-MM';
export type FormatParams_Date = {
    format: FormatParam<DateFmt>;
    // TODO:
    // splitChar: string = '-';
    // minYear?: number = 1900;
    // maxYear?: number = 2100;
    // year?: number;
    // minMonth?: number;
    // maxMonth?: number;
    // month?: number;
    // minDay?: number;
    // maxDay?: number;
    // day?: number;
};

export type DateFormat<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<
    string,
    typeof DateStringRunTypeFormat.id,
    P
>;
