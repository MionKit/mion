/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FunctionParamValidator} from './types';
import {getFunctionParamValidators} from './functionValidation';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';

describe('Deepkit reflection should', () => {
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
        const paramValidatorsUser: FunctionParamValidator[] = getFunctionParamValidators(
            updateUser,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );
        const paramValidatorsPrintSum: FunctionParamValidator[] = getFunctionParamValidators(
            printSum,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );
        const paramValidatorsIgnoreAppRelated: FunctionParamValidator[] = getFunctionParamValidators(
            (a, c) => null,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );
        const noParamValidators: FunctionParamValidator[] = getFunctionParamValidators(
            () => null,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );

        expect(paramValidatorsUser.length).toEqual(2);
        expect(paramValidatorsPrintSum.length).toEqual(4);
        expect(paramValidatorsIgnoreAppRelated.length).toEqual(0);
        expect(noParamValidators.length).toEqual(0);

        const userValidationErrors = paramValidatorsUser[0](paramUser);
        const counterStartValErrors = paramValidatorsUser[1](1);
        const counterStartValErrors2 = paramValidatorsUser[1](undefined);

        expect(userValidationErrors.length).toEqual(0);
        expect(counterStartValErrors.length).toEqual(0);
        expect(counterStartValErrors2.length).toEqual(0);
    });

    it('validate parameters of a route, fail', () => {
        const paramValidatorsUser: FunctionParamValidator[] = getFunctionParamValidators(
            updateUser,
            DEFAULT_REFLECTION_OPTIONS,
            skip
        );

        const errors1 = paramValidatorsUser[0]({});
        const errors2 = paramValidatorsUser[0](2);
        const errors3 = paramValidatorsUser[1](null); // optional parameters can't be null, only undefined

        expect(errors1.length).toEqual(1);
        expect(errors2.length).toEqual(1);
        expect(errors3.length).toEqual(1);
    });
});
