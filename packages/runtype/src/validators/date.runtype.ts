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
import {TypeFormat} from '../lib/formats.runtype';
import {MockOperation} from '../types';
import {compilePureFunctionCall, registerFormatter, registerPureFunctionGroup} from '../lib/formats';
import {JITUtils} from '../lib/jitUtils';

export type DateStringParams = {
    format: 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'MM-DD' | 'DD-MM' | 'YYYY-MM';
};

export const defaultDateParams = {
    format: 'ISO',
} as const satisfies DateStringParams;

export type DateString<P extends DateStringParams = typeof defaultDateParams> = TypeFormat<string, 'date', P>;

// Date validator
export class DateStringValidator extends JitRunTypeValidator<DateStringParams> {
    static id = 'date';
    kind = ReflectionKind.string;
    name = DateStringValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultDateParams);
        return compilePureFunctionCall(comp, rt, isDateString, {format: params.format, id: DateFormatsIds[params.format]});
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt, defaultDateParams);
        return mockDate({format: params.format, id: DateFormatsIds[params.format]});
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

type DateParams = DateStringParams & {
    id: (typeof DateFormatsIds)[keyof typeof DateFormatsIds];
};

export function mockDate(params: DateParams): string {
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

export function isDateString(value: string, ju: JITUtils, p: DateParams): boolean {
    const isY = ju.usePureFn('isYearString') as typeof isYearString;
    const isM = ju.usePureFn('isMonthString') as typeof isMonthString;
    const isD = ju.usePureFn('isDayString') as typeof isDayString;
    const parts = value.split('-');
    switch (p.id) {
        case 0: // ISO
        case 1: // 'YYYY-MM-DD'
            return parts.length === 3 && isY(parts[0]) && isM(parts[1]) && isD(parts[2]);
        case 2: // 'DD-MM-YYYY'
            return parts.length === 3 && isD(parts[0]) && isM(parts[1]) && isY(parts[2]);
        case 3: // 'MM-DD-YYYY'
            return parts.length === 3 && isM(parts[0]) && isD(parts[1]) && isY(parts[2]);
        case 4: // 'YYYY-MM'
            return parts.length === 2 && isY(parts[0]) && isM(parts[1]);
        case 5: // 'MM-DD'
            return parts.length === 2 && isM(parts[0]) && isD(parts[1]);
        case 6: // 'DD-MM'
            return parts.length === 2 && isD(parts[0]) && isM(parts[1]);
        default:
            throw new Error(`Invalid date format: ${p.format}`);
    }
}

export function isYearString(value: string): boolean {
    if (value.length !== 4) return false;
    const year = Number(value);
    return !isNaN(year) && year >= 0 && year <= 9999;
}

export function isMonthString(value: string): boolean {
    if (value.length !== 2) return false;
    const month = Number(value);
    return !isNaN(month) && month >= 1 && month <= 12;
}

export function isDayString(value: string): boolean {
    if (value.length !== 2) return false;
    const day = Number(value);
    return !isNaN(day) && day >= 1 && day <= 31;
}

// ######### Registering the date validator #########
registerPureFunctionGroup([isDateString, isYearString, isMonthString, isDayString]);
registerFormatter(new DateStringValidator());
