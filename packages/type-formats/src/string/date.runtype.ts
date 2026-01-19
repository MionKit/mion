/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JITUtils, GenericPureFunction} from '@mionkit/core';
import {ReflectionKind} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler, BaseRunType, RunTypeOptions, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, registerFormatter, registerPureFnClosure, TypeFormat} from '@mionkit/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {paramVal} from '../utils';
import {DateFmt, FormatParams_Date} from '@mionkit/core';

// Date validator
export class DateStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Date> {
    static id = 'date' as const;
    kind = ReflectionKind.string;
    name = DateStringRunTypeFormat.id;
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const formatFn = this.getFormatPureFn(paramVal(params.format));
        return {code: this.compilePureFunctionCall(comp, rt, formatFn).callCode, type: 'E'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const isTypeCodeObj = this.emitIsType(comp, rt);
        const isTypeCode = isTypeCodeObj.code;
        if (!isTypeCode) return {code: '', type: 'S'};
        const params = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return {code: `if (!(${isTypeCode})) ${errFn('format', paramVal(params.format))}`, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        const yy = Math.floor(Math.random() * 10000);
        const mm = Math.floor(Math.random() * 12) + 1;
        const dd = Math.floor(Math.random() * getMaxDaysInMonth(yy, mm)) + 1;
        const year = String(yy).padStart(4, '0');
        const month = String(mm).padStart(2, '0');
        const day = String(dd).padStart(2, '0');
        switch (paramVal(params.format)) {
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
                throw new Error(`Invalid date format: ${paramVal(params.format)}`);
        }
    }
    getFormatPureFn(format: DateFmt) {
        switch (format) {
            case 'ISO':
            case 'YYYY-MM-DD':
                return mionIsDateString_YMD;
            case 'DD-MM-YYYY':
                return mionIsDateString_DMY;
            case 'MM-DD-YYYY':
                return mionIsDateString_MDY;
            case 'YYYY-MM':
                return mionIsDateString_YM;
            case 'MM-DD':
                return mionIsDateString_MD;
            case 'DD-MM':
                return mionIsDateString_DM;
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
export function mionIsDateString() {
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
export function mionIsDateString_YMD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function mionIsDateString_DMY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function mionIsDateString_MDY(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function mionIsDateString_YM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function mionIsDateString_MD(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

/** @reflection never */
export function mionIsDateString_DM(jUtil: JITUtils) {
    const isDate = jUtil.getPureFn('pf_mionIsDateString') as any as ReturnType<typeof mionIsDateString>;
    return function is_date(value: string): boolean {
        const parts = value.split('-');
        return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
    } satisfies GenericPureFunction<FormatParams_Date>;
}

// ######### Registering the date validator #########

export const dateFunctions = [
    mionIsDateString,
    mionIsDateString_YMD,
    mionIsDateString_DMY,
    mionIsDateString_MDY,
    mionIsDateString_YM,
    mionIsDateString_MD,
    mionIsDateString_DM,
];
registerPureFnClosure(mionIsDateString);
registerPureFnClosure(mionIsDateString_YMD, [mionIsDateString]);
registerPureFnClosure(mionIsDateString_DMY, [mionIsDateString]);
registerPureFnClosure(mionIsDateString_MDY, [mionIsDateString]);
registerPureFnClosure(mionIsDateString_YM, [mionIsDateString]);
registerPureFnClosure(mionIsDateString_MD, [mionIsDateString]);
registerPureFnClosure(mionIsDateString_DM, [mionIsDateString]);

export const DATE_RUN_TYPE_FORMATTER = registerFormatter(new DateStringRunTypeFormat());

// ############### Run Types ###############

export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type StrDate<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<
    string,
    typeof DateStringRunTypeFormat.id,
    P
>;
