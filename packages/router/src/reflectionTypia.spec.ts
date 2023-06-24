/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import typia from 'typia';
import {Context, isFunctionType, RouteParamValidator} from './types';
import {DEFAULT_ROUTE_OPTIONS} from './constants';

describe('Deepkit reflection should', () => {
    type Message = {
        message: string;
    };

    type SumMax100Args = {
        /** @maximum 40 */
        a: number;
        /** @maximum 50 */
        b: number;
    };

    /**
     * Bellow Metadata maximum metadata does not get read (on the @param)
     * @param {number} a @maximum 30
     * @param {number} b  @maximum 20
     */
    const sumMax100 = (
        /** Metadata on params does not get read neither
         * @maximum 35
         * */
        a: number,
        /** Metadata on params does not get read neither
         * @maximum 15
         * */
        b: number
    ) => a + b;

    /**
     *
     * @param args
     * @returns number @maximum 100
     */
    const sumMax100Args = (args: SumMax100Args) => args.a + args.b;

    it('extract optional information from function parameters', () => {
        type A = Parameters<typeof sumMax100>[0];
        type B = Parameters<typeof sumMax100>[1];
        type Args = Parameters<typeof sumMax100Args>[0];

        const aValidator = typia.createValidateEquals<A>();
        const bValidator = typia.createValidateEquals<B>();
        const argsValidator = typia.createValidateEquals<Args>();

        expect(aValidator(200)).toContainEqual({success: false});
        expect(bValidator(200)).toContainEqual({success: false});
        expect(argsValidator({c: 200, d: 200})).toContainEqual({success: false});
        console.log('done 1');
    });
});
