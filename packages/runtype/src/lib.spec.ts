/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, reflect} from '@deepkit/type';
import {FunctionParamValidator, isFunctionType} from './types';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';

describe('Deepkit reflection should', () => {
    type Message = {
        message: string;
    };

    const printSum = (app, ctx, a: number, b: number, c?: {message: string}, d?: Message) =>
        `${c?.message || d?.message || 'sum'} => ${a + b}`;

    it('extract optional information from function parameters', () => {
        const printSumType = reflect(printSum);
        let requiredParams = 0;
        let optionalParams = 0;
        if (!isFunctionType(printSumType)) throw new Error('invalid reflection');

        printSumType.parameters.forEach((param) => {
            if (param.optional) optionalParams++;
            else requiredParams++;
        });

        expect(printSumType.kind).toEqual(ReflectionKind.function);
        expect(printSumType.parameters.length).toEqual(6);
        expect(requiredParams).toEqual(4);
        expect(optionalParams).toEqual(2);
    });

    it('extract type information when original variable is not referenced', () => {
        const map: Map<string, (...args: any) => any> = new Map();
        map.set('sum function', printSum);
        const printSumFromMap = map.get('sum function');
        const printSumType = reflect(printSum);
        const typeFromMap = reflect(printSumFromMap);

        expect(printSumType.kind === ReflectionKind.function).toBeTruthy();
        expect(typeFromMap.kind === ReflectionKind.function).toBeTruthy();
    });
});
