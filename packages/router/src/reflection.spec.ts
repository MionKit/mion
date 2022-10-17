/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, reflect, typeOf} from '@deepkit/type';
import {getParamValidators, isFirstParameterContext} from './reflection';
import {setCallContext} from './router';
import {Context, isFunctionType, RouteParamValidator} from './types';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

describe('Deepkit reflection should', () => {
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
    const app = {db: () => null};
    const req = {headers: {}, body: '{}'};
    const resp = {statusCode: 200, headers: {}, body: null};
    const sharedDataFactory = () => ({hello: 'world'});
    const paramUser = {
        id: 1,
        name: 'john',
        surname: 'Smith',
        counter: 0,
        lastUpdate: new Date('December 17, 2020 03:24:00'),
    };

    type CallContext = Context<typeof app, ReturnType<typeof sharedDataFactory>, typeof req, typeof resp>;
    const printSum = (a: number, b: number, c?: {message: string}, d?: Message) =>
        `${c?.message || d?.message || 'sum'} => ${a + b}`;

    const updateUser = (context: CallContext, user: User, counterStart?: number): User => {
        const updated = {
            ...user,
            lastUpdate: new Date(),
            counter: counterStart ? counterStart + 1 : user.counter + 1,
        };
        return updated;
    };

    it('extract type information from a function', () => {
        const printSumType = reflect(printSum);
        let requiredParams = 0;
        if (!isFunctionType(printSumType)) throw 'invalid reflection';

        printSumType.parameters.forEach((param) => {
            if (param.optional) requiredParams++;
        });

        expect(printSumType.kind).toEqual(ReflectionKind.function);
        expect(printSumType.parameters.length).toEqual(4);
        expect(requiredParams).toEqual(2);
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

    it('validate parameters of a route, success', () => {
        const paramValidatorsUser: RouteParamValidator[] = getParamValidators(updateUser);
        const paramValidatorsPrintSum: RouteParamValidator[] = getParamValidators(printSum);
        const paramValidatorsIgnoreFirst: RouteParamValidator[] = getParamValidators((a: any) => null);
        const noParamValidators: RouteParamValidator[] = getParamValidators(() => null);

        expect(paramValidatorsUser.length).toEqual(2);
        expect(paramValidatorsPrintSum.length).toEqual(3);
        expect(paramValidatorsIgnoreFirst.length).toEqual(0);
        expect(noParamValidators.length).toEqual(0);

        const userValidationErrors = paramValidatorsUser[0](paramUser);
        const counterStartValErrors = paramValidatorsUser[1](1);
        const counterStartValErrors2 = paramValidatorsUser[1](undefined);

        expect(userValidationErrors.length).toEqual(0);
        expect(counterStartValErrors.length).toEqual(0);
        expect(counterStartValErrors2.length).toEqual(0);
    });

    it('validate parameters of a route, fail', () => {
        const paramValidatorsUser: RouteParamValidator[] = getParamValidators(updateUser);

        const errors1 = paramValidatorsUser[0]({});
        const errors2 = paramValidatorsUser[0](2);
        const errors3 = paramValidatorsUser[1](null); // optional parameters can't be null, only undefined

        expect(errors1.length).toEqual(1);
        expect(errors2.length).toEqual(1);
        expect(errors3.length).toEqual(1);
    });

    it('validate if the first parameter of a route is Context', () => {
        const contextType = typeOf<CallContext>();

        expect(isFirstParameterContext(contextType, updateUser)).toBeTruthy();
        expect(isFirstParameterContext(contextType, printSum)).toBeFalsy();
    });

    it('should set call context', () => {
        type App = typeof app;
        type SharedData = ReturnType<typeof sharedDataFactory>;
        type AppContext = Context<App, SharedData, APIGatewayEvent, APIGatewayProxyResult>;
        const {typedContext} = setCallContext<App, SharedData, APIGatewayEvent, APIGatewayProxyResult>(app, sharedDataFactory);
        type AppContext2 = typeof typedContext;
    });
});
