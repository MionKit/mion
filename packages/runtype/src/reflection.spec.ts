/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type, reflect} from '@deepkit/type';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';
import {getFunctionReflectionMethods} from './reflection';
import {ParamsValidationResponse, ReturnValidationResponse} from './types';

describe('Deepkit reflection should', () => {
    const skip = 1; // skipping  ctx
    type Message = {
        message: string;
    };

    const printSum = (ctx, a: number, b: number, date: Date, c?: {message: string}, d?: Message) =>
        `${c?.message || d?.message || 'sum'} => ${a + b} at ${date.toISOString}`;

    function setup() {
        const reflection = getFunctionReflectionMethods(printSum, DEFAULT_REFLECTION_OPTIONS, skip);

        const handlerType: Type = reflect(printSum);
        const params = [3, 3, new Date('2021-12-19T00:24:00.000'), {message: 'hello'}, {message: 'world'}];
        const serializedParams = [3, 3, '2021-12-19T00:24:00.000Z', {message: 'hello'}, {message: 'world'}];

        const expected1: ParamsValidationResponse = {errors: [[], [], [], [], []], hasErrors: false, totalErrors: 0};
        const expected2: ReturnValidationResponse = {error: [], hasErrors: false};
        return {reflection, handlerType, params, serializedParams, expected1, expected2};
    }

    it('create an object containing all serialization, deserialization and validation functions', () => {
        const {reflection, params, serializedParams, expected1, expected2} = setup();
        expect(reflection.validateParams(params)).toEqual(expected1);
        expect(reflection.validateReturn('sum ...')).toEqual(expected2);

        expect(reflection.serializeParams(params)).toEqual(serializedParams);
        expect(reflection.serializeReturn('sum ...')).toEqual('sum ...');

        expect(reflection.deserializeParams(serializedParams)).toEqual(params);
        expect(reflection.deserializeReturn('sum ...')).toEqual('sum ...');
    });
});
