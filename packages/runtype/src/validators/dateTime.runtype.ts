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
import {ErrorsPureFunction, InvalidFormatParams, MockOperation} from '../types';
import {
    DateStringParams,
    defaultDateParams,
    isDateString,
    mockDateString,
    parseDateStringParams,
    ParsedDateStringParams,
} from './date.runtype';
import {
    defaultTimeParams,
    isTimeString,
    mockTimeString,
    ParsedTimeStringParams,
    parseTimeStringParams,
    TimeStringParams,
} from './time.runtype';
import {JITUtils} from '../lib/jitUtils';
import {
    compileErrorsPureFunctionCall,
    compilePureFunctionCall,
    registerFormatter,
    registerPureFunctionGroupWithCtx,
} from '../lib/formats';

export type StringDateTimeParams = {
    date: DateStringParams;
    time: TimeStringParams;
    splitChar: string;
};

export type ParsedStringDateTimeParams = {
    date: DateStringParams & {id: ParsedDateStringParams['id']};
    time: TimeStringParams & {id: ParsedTimeStringParams['id']};
    splitChar: string;
};

export const defaultDateTimeParams = {
    date: defaultDateParams,
    time: defaultTimeParams,
    splitChar: 'T',
} as const satisfies StringDateTimeParams;

export type DateTimeString<P extends Partial<StringDateTimeParams> = typeof defaultDateTimeParams> = TypeFormat<
    string,
    typeof DateTimeValidator.id,
    P
>;

// DateTime validator
export class DateTimeValidator extends JitRunTypeValidator<StringDateTimeParams> {
    static id = 'dateTime' as const;
    kind = ReflectionKind.string;
    name = DateTimeValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultDateTimeParams);
        return compilePureFunctionCall(comp, rt, isDateTime, parseDateTimeString(params));
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultDateTimeParams);
        // the get type errors function does not need to be so optimized so we call a single function that makes all the checks
        return compileErrorsPureFunctionCall(comp, rt, dateTimeErrors, parseDateTimeString(params), this.name);
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt, defaultDateTimeParams);
        return mockDateTimeString(parseDateTimeString(params));
    }
}

export function mockDateTimeString(params: ParsedStringDateTimeParams): string {
    return `${mockDateString(params.date)}${params.splitChar}${mockTimeString(params.time)}`;
}
/** @reflection never */
export function parseDateTimeString(params: StringDateTimeParams): ParsedStringDateTimeParams {
    return {
        date: parseDateStringParams(params.date),
        time: parseTimeStringParams(params.time),
        splitChar: params.splitChar,
    };
}
/** @reflection never */
export function isDateTime(utl: JITUtils) {
    const isDate = utl.usePureFn('isDateString') as ReturnType<typeof isDateString>;
    const isTime = utl.usePureFn('isTimeString') as ReturnType<typeof isTimeString>;
    return function is_date_time_string(value: string, params: ParsedStringDateTimeParams): boolean {
        const [date, time] = value.split(params.splitChar);
        if (!date || !time) return false;
        return isDate(date, params.date) && isTime(time, params.time);
    };
}

/** @reflection never */
export function dateTimeErrors(utl: JITUtils) {
    const isDate = utl.usePureFn('isDateString') as ReturnType<typeof isDateString>;
    const isTime = utl.usePureFn('isTimeString') as ReturnType<typeof isTimeString>;
    return function date_time_errors(value: string, params: ParsedStringDateTimeParams): InvalidFormatParams | undefined {
        const [date, time] = value.split(params.splitChar);
        if (!date || !time) return {date: {format: params.date.format}, time: {format: params.time.format}};
        const isD = isDate(date, params.date);
        const idT = isTime(time, params.time);
        if (!isD && !idT) return {date: {format: params.date.format}, time: {format: params.time.format}};
        if (!isD) return {date: {format: params.date.format}};
        if (!idT) return {time: {format: params.time.format}};
    } as ErrorsPureFunction<ParsedStringDateTimeParams>;
}

// ######### Registering validator and pure functions ########
registerFormatter(new DateTimeValidator());
registerPureFunctionGroupWithCtx([isDateTime, isDateString, isTimeString]);
