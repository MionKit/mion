/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FunctionParamValidator} from './types';
import {getFunctionParamValidators, validateFunctionParams} from './validation';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';

describe('Deepkit validation should', () => {
    const skip = 2; // skipping app and ctx
    type Message = {
        message: string;
    };
    type User = {
        id: number;
        name: string;
        surname: string;
        counter: number;
        lastUpdate: Date;
    };
    const paramUser = {
        id: 1,
        name: 'john',
        surname: 'Smith',
        counter: 0,
        lastUpdate: new Date('December 17, 2020 03:24:00'),
    };

    const printSum = (app, ctx, a: number, b: number, c?: {message: string}, d?: Message) =>
        `${c?.message || d?.message || 'sum'} => ${a + b}`;

    const updateUser = (app, ctx, user: User, counterStart?: number): User => {
        const updated = {
            ...user,
            lastUpdate: new Date(),
            counter: counterStart ? counterStart + 1 : user.counter + 1,
        };
        return updated;
    };

    it('validate parameters of a route, success', () => {
        const paramValidatorsUser = getFunctionParamValidators(updateUser, DEFAULT_REFLECTION_OPTIONS, skip);
        const paramValidatorsPrintSum = getFunctionParamValidators(printSum, DEFAULT_REFLECTION_OPTIONS, skip);
        const paramValidatorsIgnoreAppRelated = getFunctionParamValidators((a, c) => null, DEFAULT_REFLECTION_OPTIONS, skip);
        const noParamValidators = getFunctionParamValidators(() => null, DEFAULT_REFLECTION_OPTIONS, skip);

        expect(paramValidatorsUser.length).toEqual(2);
        expect(paramValidatorsPrintSum.length).toEqual(4);
        expect(paramValidatorsIgnoreAppRelated.length).toEqual(0);
        expect(noParamValidators.length).toEqual(0);

        const updateUserResponse = validateFunctionParams(paramValidatorsUser, [paramUser, 0]);
        const counterStartResponse = validateFunctionParams(paramValidatorsUser, [paramUser, undefined]);

        expect(updateUserResponse).toEqual({hasErrors: false, totalErrors: 0, errors: [[], []]});
        expect(counterStartResponse).toEqual({hasErrors: false, totalErrors: 0, errors: [[], []]});
    });

    it('validate parameters of a route, fail', () => {
        const paramValidatorsUser: FunctionParamValidator[] = getFunctionParamValidators(
            updateUser,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );

        const resp1 = validateFunctionParams(paramValidatorsUser, [{abcdef: 'hello'}]);
        const resp2 = validateFunctionParams(paramValidatorsUser, [2]);
        const resp3 = validateFunctionParams(paramValidatorsUser, [null]); // required parameters can't be null, only undefined

        expect(resp1).toEqual({hasErrors: true, totalErrors: 5, errors: expect.any(Array)}); // one error por invalid field
        expect(resp2).toEqual({hasErrors: true, totalErrors: 1, errors: expect.any(Array)});
        expect(resp3).toEqual({hasErrors: true, totalErrors: 1, errors: expect.any(Array)});
    });

    it('should accept a shorter parameters array if some parameters are undefined', () => {
        const paramValidatorsUser = getFunctionParamValidators(updateUser, DEFAULT_REFLECTION_OPTIONS, skip);

        const updateUserResponse = validateFunctionParams(paramValidatorsUser, [paramUser]);
        expect(updateUserResponse).toEqual({hasErrors: false, totalErrors: 0, errors: [[], []]});
        expect(() => {
            validateFunctionParams(paramValidatorsUser, [paramUser, 3, 3]);
        }).toThrow('Invalid number of parameters');
    });
});
