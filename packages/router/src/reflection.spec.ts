/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, reflect, typeOf} from '@deepkit/type';
import {getOutputSerializer, getParamsDeserializer, getParamValidators, isFirstParameterContext} from './reflection';
import {Context, Handler, isFunctionType, Route, RouteParamValidator} from './types';
import {DEFAULT_ROUTE_OPTIONS} from './constants';

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
    type DataPoint = {
        date: Date;
    };
    const app = {db: () => null};
    const req = {headers: {}, body: '{}'};
    const sharedDataFactory = () => ({hello: 'world'});
    const paramUser = {
        id: 1,
        name: 'john',
        surname: 'Smith',
        counter: 0,
        lastUpdate: new Date('December 17, 2020 03:24:00'),
    };
    const addDate: Route = (context, data: DataPoint): DataPoint => {
        return data;
    };

    type CallContext = Context<typeof app, ReturnType<typeof sharedDataFactory>>;
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
        const paramValidatorsUser: RouteParamValidator[] = getParamValidators(updateUser, DEFAULT_ROUTE_OPTIONS);
        const paramValidatorsPrintSum: RouteParamValidator[] = getParamValidators(
            printSum as any as Handler,
            DEFAULT_ROUTE_OPTIONS
        );
        const paramValidatorsIgnoreFirst: RouteParamValidator[] = getParamValidators(() => null, DEFAULT_ROUTE_OPTIONS);
        const noParamValidators: RouteParamValidator[] = getParamValidators(() => null, DEFAULT_ROUTE_OPTIONS);

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
        const paramValidatorsUser: RouteParamValidator[] = getParamValidators(updateUser, DEFAULT_ROUTE_OPTIONS);

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
        expect(isFirstParameterContext(contextType, printSum as any as Handler)).toBeFalsy();
    });

    it('should serialize/deserialize data', () => {
        const dataPoint: DataPoint = {date: new Date('December 19, 2020 03:24:00')};
        const serializedDataPoint = {date: '2020-12-19T02:24:00.000Z'};
        const deSerializers = getParamsDeserializer(addDate, DEFAULT_ROUTE_OPTIONS);
        const outputSerializer = getOutputSerializer(addDate, DEFAULT_ROUTE_OPTIONS);
        const input = JSON.parse(JSON.stringify(dataPoint)); // this would be same as json.parse(body)

        const deserialized = deSerializers[0](input);
        const output = addDate(null as any, deserialized);
        const serialized = outputSerializer(output); //safe fo Json to parse

        expect(input).toEqual(serializedDataPoint);
        expect(typeof input.date).toEqual('string');
        expect(deserialized).toEqual(dataPoint);
        expect(typeof deserialized.date).toEqual('object');

        expect(output).toEqual(dataPoint);
        expect(typeof output.date).toEqual('object');
        expect(serialized).toEqual(serializedDataPoint);
        expect(typeof serialized.date).toEqual('string');
    });

    it('should not do soft deserialization with router default options', () => {
        const deSerializers = getParamsDeserializer(updateUser, DEFAULT_ROUTE_OPTIONS);
        const date = new Date();
        const user1 = {
            id: 1,
            name: false,
            surname: false,
            counter: false,
            lastUpdate: date,
        };
        const parsed1 = JSON.parse(JSON.stringify(user1));

        const deserialized1 = deSerializers[0](parsed1);
        expect(deserialized1).toEqual(user1);
    });

    // TODO: validate router explicit types
    // it('check for handler explicit definitions', () => {
    //     const funcAllOK = (a: number, name: string): string => `sayHello ${name} ${a}`;
    //     const funcParamNotDefined = (name): string => `sayHello ${name}`;
    //     const funcReturnNotDefined = (name: any) => `sayHello ${name}`;
    //     const funcReturnAny = (name: string): any => `sayHello ${name}`;
    //     const funcMultipleTypes = (name: number | string): number | string => `sayHello ${name}`;
    //     const funcOptionalParams = (name?: number): string => `sayHello ${name || 'unknowkn'}`;

    //     expect(hasExplicitTypes(funcAllOK as any as Handler)).toBeTruthy();
    //     expect(hasExplicitTypes(funcParamNotDefined as any as Handler)).toBeFalsy();
    //     expect(hasExplicitTypes(funcReturnNotDefined as any as Handler)).toBeFalsy();
    //     expect(hasExplicitTypes(funcReturnAny as any as Handler)).toBeFalsy();
    //     expect(hasExplicitTypes(funcMultipleTypes as any as Handler)).toBeTruthy();
    //     expect(hasExplicitTypes(funcOptionalParams as any as Handler)).toBeTruthy();
    // });
});
