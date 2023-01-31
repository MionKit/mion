/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
process.env.GENERATE_ROUTER_SPEC = 'true'; // required to generate public routes object

import {serializeType, deserializeType, reflect, Type, toSignature} from '@deepkit/type';
import {DEFAULT_ROUTE_OPTIONS, getParamValidators, isFunctionType, Handler} from '@mikrokit/router';
import {join} from 'path';
import {getSpecFile} from './specCodegen';
import {myApi} from './test/myApi.routes';
import {CodegenOptions} from './types';

describe('generate api spec should', () => {
    const generateOptions: CodegenOptions = {
        outputFileName: join(__dirname, './test/.spec/myPublicApi.routes.ts'),
        entryFileName: join(__dirname, './test/myApi.routes.ts'),
        tsConfigFilePath: join(__dirname, '../tsconfig.json'),
    };

    it('should get spec source file', () => {
        const tsSpec = getSpecFile(generateOptions, [myApi], ['myApi']);
        console.log(tsSpec);
        expect(tsSpec).toBeTruthy();
    });

    // TODO, we should not test too much here, better test the real generated objects
});

// bellow tests doesn't need to be run every time is just investigation work
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('this is just investigation about how deepkit types serialization works', () => {
    enum Country {
        spain = 'spain',
        france = 'france',
        uk = 'uk',
        usa = 'usa',
    }
    type CountryKey = keyof typeof Country;
    type SimpleUser = {name: string; surname: string};
    type DataPoint = {date: Date};
    type AndUser = SimpleUser & {address?: string};
    type OrUser = SimpleUser | {whatAmI: string};
    interface ExtendedUser extends SimpleUser {
        country: string;
    }

    const routeCountry = (app, ctx, country: CountryKey): CountryKey => country;
    const routeSimpleUser = (app, ctx, user: SimpleUser): SimpleUser => user;
    const routeDataPoint = (app, ctx, dataPoint: DataPoint): DataPoint => dataPoint;
    const routeAndUser = (app, ctx, andUser: AndUser): AndUser => andUser;
    const routeOrUser = (app, ctx, orUser: OrUser): OrUser => orUser;
    const routeExtendedUser = (app, ctx, extendedUser: ExtendedUser): ExtendedUser => extendedUser;

    type rType = Parameters<typeof routeCountry>;
    type typeP = rType[1];

    const routers = {
        routeCountry,
        routeSimpleUser,
        routeDataPoint,
        routeAndUser,
        routeOrUser,
        routeExtendedUser,
    };

    const serializeDeserializeHandlerType = (handlerType: Type) => {
        if (!isFunctionType(handlerType)) throw 'Invalid handler';
        console.log('toSignature', toSignature(handlerType as any));
        const serializedType = serializeType(handlerType);
        const json = JSON.stringify(serializedType);
        const restoredType = JSON.parse(json);
        const desHandlerType = deserializeType(restoredType);
        if (!isFunctionType(desHandlerType)) throw 'Invalid deserialized handler';
        // console.log('handlerType', handlerType.parameters[1].type.jit);
        // console.log('desHandlerType', desHandlerType.parameters[1].type.jit);
        return desHandlerType;
    };

    const getValidators = (route: Handler) => {
        const handlerType = reflect(route);
        const restoredHandlerType = serializeDeserializeHandlerType(handlerType);
        const validators = getParamValidators(route, DEFAULT_ROUTE_OPTIONS, handlerType);
        const restoredValidators = getParamValidators(undefined as any, DEFAULT_ROUTE_OPTIONS, restoredHandlerType);

        return {validators, restoredValidators};
    };

    it('validate serialize/deserialize types for routeCountry', () => {
        const {validators, restoredValidators} = getValidators(routeCountry);

        const validItem = 'spain';
        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });

    it('validate serialize/deserialize types for routeSimpleUser', () => {
        const {validators, restoredValidators} = getValidators(routeSimpleUser);

        const validItem = {name: 'hello', surname: 'world'};
        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });

    it('validate serialize/deserialize types for routeDataPoint', () => {
        const {validators, restoredValidators} = getValidators(routeDataPoint);

        const validItem = {hello: 'world'};

        console.log('validator', validators[0](validItem));
        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });
});
