/* eslint-disable @typescript-eslint/ban-types */

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
import {ErrorsPureFunction, GenericPureFunction, InvalidFormatParam, InvalidFormatParams, JitFnID, MockOperation} from '../types';
import {dateFunctions, DateStringParams, dateStringValidator, DefaultDateParams} from './date.runtype';
import {DefaultTimeParams, timeFunctions, TimeStringParams, timeStringValidator} from './time.runtype';
import {
    compileErrorsPureFunctionCall,
    compilePureFunctionCall,
    registerFormatter,
    registerPureFunctionWithCtx,
} from '../lib/formats';
import {JitFunctions} from '../constants';

export type StringDateTimeParams = {
    date: DateStringParams;
    time: TimeStringParams;
    splitChar: string;
};

export type DefaultDateTimeParams = {
    date: DefaultDateParams;
    time: DefaultTimeParams;
    splitChar: 'T';
};

export type DateTimeString<P extends Partial<StringDateTimeParams> = {}> = TypeFormat<
    string,
    typeof DateTimeFormat.id,
    DefaultDateTimeParams & P
>;

// DateTime validator
export class DateTimeFormat extends JitRunTypeFormatter<StringDateTimeParams> {
    static id = 'dateTime' as const;
    kind = ReflectionKind.string;
    name = DateTimeFormat.id;
    jitFnIsExpression(fnId: JitFnID) {
        switch (fnId) {
            case JitFunctions.isType.id:
                return false;
            default:
                return super.jitFnIsExpression(fnId);
        }
    }
    getParams(rt: BaseRunType): StringDateTimeParams & Record<'isDateFn()' | 'isTimeFn()', string> {
        const params = super.getParams(rt);
        const dateFn = dateStringValidator.getFormatPureFn(params.date.format);
        const timeFn = timeStringValidator.getFormatPureFn(params.time.format);
        return {
            ...params,
            'isDateFn()': dateFn.name,
            'isTimeFn()': timeFn.name,
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return compilePureFunctionCall(comp, rt, this, isDateTime).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        return compileErrorsPureFunctionCall(comp, rt, this, dateTimeErrors).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const mockedDate = dateStringValidator.mock(mockContext, rt, params.date);
        const mockTimeString = timeStringValidator.mock(mockContext, rt, params.time);
        return `${mockedDate}${params.splitChar}${mockTimeString}`;
    }
    _compileFormat?(comp: JitCompiler, rt: BaseRunType); // no format needed
}

type isDateTimeParams = StringDateTimeParams & {
    isDateFn: GenericPureFunction<DateStringParams>;
    isTimeFn: GenericPureFunction<TimeStringParams>;
};

/** @reflection never */
function isDateTime() {
    return function is_date_time(dt: string, p: isDateTimeParams): boolean {
        const parts = dt.split(p.splitChar);
        if (parts.length !== 2) return false;
        return p.isDateFn(parts[0], p.date) && p.isTimeFn(parts[1], p.time);
    }; // this function does not satisfies Generic pure function as isDateFn and isTimeFn are passed as params
}

/** @reflection never */
export function dateTimeErrors() {
    return function date_time_errors(dt: string, p: isDateTimeParams): InvalidFormatParams | undefined {
        const invalid: [string, InvalidFormatParam][] = [];
        const parts = dt.split(p.splitChar);
        if (parts.length === 2) {
            if (!p.isDateFn(parts[0], p.date)) invalid.push([`date`, {format: p.date.format}]);
            if (!p.isTimeFn(parts[1], p.time)) invalid.push([`time`, {format: p.time.format}]);
        } else {
            invalid.push([`date`, {format: p.date.format}]);
            invalid.push([`time`, {format: p.time.format}]);
        }
        if (invalid.length) return Object.fromEntries(invalid);
    } as ErrorsPureFunction<StringDateTimeParams>;
}

// ######### Registering validator and pure functions ########
registerPureFunctionWithCtx(isDateTime, [...dateFunctions, ...timeFunctions]);
registerPureFunctionWithCtx(dateTimeErrors, [...dateFunctions, ...timeFunctions]);
registerFormatter(new DateTimeFormat());
