/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {MockOperation} from '../types';
import {compilePureFunctionCall, registerFormatter, registerPureFunctionWithCtx} from '../lib/formats';

export type DateStringParams = {
    format: 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'MM-DD' | 'DD-MM' | 'YYYY-MM';
};

export type ParsedDateStringParams = DateStringParams & {
    id: (typeof DateFormatsIds)[keyof typeof DateFormatsIds];
};

export const defaultDateParams = {
    format: 'ISO',
} as const satisfies DateStringParams;

export type DateString<P extends Partial<DateStringParams> = typeof defaultDateParams> = TypeFormat<
    string,
    typeof DateStringValidator.id,
    P
>;

// Date validator
export class DateStringValidator extends JitRunTypeValidator<DateStringParams> {
    static id = 'date' as const;
    kind = ReflectionKind.string;
    name = DateStringValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultDateParams);
        return compilePureFunctionCall(comp, rt, isDateString, parseDateStringParams(params));
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt, defaultDateParams);
        const formatError = {name: this.name, invalid: {format: params.format}};
        return `if (!(${isTypeCode})) ${comp.callJitErr(rt, undefined, formatError)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt, defaultDateParams);
        return mockDateString({format: params.format, id: DateFormatsIds[params.format]});
    }
}

// string formats are mapped to number for faster comparison
const DateFormatsIds = {
    ISO: 0,
    'YYYY-MM-DD': 1,
    'DD-MM-YYYY': 2,
    'MM-DD-YYYY': 3,
    'YYYY-MM': 4,
    'MM-DD': 5,
    'DD-MM': 6,
} as const;

export function parseDateStringParams(params: DateStringParams): ParsedDateStringParams {
    return {format: params.format, id: DateFormatsIds[params.format]};
}

export function mockDateString(params: ParsedDateStringParams): string {
    const year = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    switch (params.id) {
        case 0: // ISO
        case 1: // 'YYYY-MM-DD'
            return `${year}-${month}-${day}`;
        case 2: // 'DD-MM-YYYY'
            return `${day}-${month}-${year}`;
        case 3: // 'MM-DD-YYYY'
            return `${month}-${day}-${year}`;
        case 4: // 'YYYY-MM'
            return `${year}-${month}`;
        case 5: // 'MM-DD'
            return `${month}-${day}`;
        case 6: // 'DD-MM'
            return `${day}-${month}`;
        default:
            throw new Error(`Invalid date format: ${params.format}`);
    }
}

/** @reflection never */
export function isDateString() {
    // check is a valid date taking into account leap years
    function isFullDate(year: string | undefined, month: string, day?: string): boolean {
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
    }
    return function is_date_string(value: string, p: ParsedDateStringParams): boolean {
        const parts = value.split('-');
        switch (p.id) {
            case 0: // ISO
            case 1: // 'YYYY-MM-DD'
                return parts.length === 3 && isFullDate(parts[0], parts[1], parts[2]);
            case 2: // 'DD-MM-YYYY'
                return parts.length === 3 && isFullDate(parts[2], parts[1], parts[0]);
            case 3: // 'MM-DD-YYYY'
                return parts.length === 3 && isFullDate(parts[2], parts[0], parts[1]);
            case 4: // 'YYYY-MM'
                return parts.length === 2 && isFullDate(parts[0], parts[1]);
            case 5: // 'MM-DD'
                return parts.length === 2 && isFullDate(undefined, parts[0], parts[1]);
            case 6: // 'DD-MM'
                return parts.length === 2 && isFullDate(undefined, parts[1], parts[0]);
            default:
                throw new Error(`Invalid date format: ${p.format}`);
        }
    };
}

// ######### Registering the date validator #########
registerPureFunctionWithCtx(isDateString);
export const dateStringValidator = registerFormatter(new DateStringValidator());
