/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler, BaseRunType, RunTypeOptions, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, registerFormatter, TypeFormat} from '@mionkit/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {paramVal} from '../utils.ts';
import {DateFmt, FormatParams_Date} from '@mionkit/core';
import {
    cpf_isDateString_YMD,
    cpf_isDateString_DMY,
    cpf_isDateString_MDY,
    cpf_isDateString_YM,
    cpf_isDateString_MD,
    cpf_isDateString_DM,
} from '../type-formats-pure-fns.ts';

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
                return cpf_isDateString_YMD;
            case 'DD-MM-YYYY':
                return cpf_isDateString_DMY;
            case 'MM-DD-YYYY':
                return cpf_isDateString_MDY;
            case 'YYYY-MM':
                return cpf_isDateString_YM;
            case 'MM-DD':
                return cpf_isDateString_MD;
            case 'DD-MM':
                return cpf_isDateString_DM;
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

// ######### Registering the date validator #########

export const DATE_RUN_TYPE_FORMATTER = registerFormatter(new DateStringRunTypeFormat());

// ############### Run Types ###############

export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
/** Date string format, always branded with 'date'. */
export type StrDate<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<
    string,
    typeof DateStringRunTypeFormat.id,
    P,
    'date'
>;
