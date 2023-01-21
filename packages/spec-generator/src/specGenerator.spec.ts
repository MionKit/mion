/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mocks window object used in the spec
global.window = Object.create({
    location: {
        origin: 'http://mikrokit.io',
    },
});

import {serializeType, deserializeType, reflect, Type, toSignature} from '@deepkit/type';
import {DEFAULT_ROUTE_OPTIONS, getParamValidators, isFunctionType, Handler} from '@mikrokit/router';
import {join} from 'path';
import {addSpecRoutes, getApiSpec} from './specGenerator';
import {myApiRoutes} from './test/myApi.routes';
import {GenerateSpecOptions} from './types';

describe('generate api spec should', () => {
    const generateOptions: GenerateSpecOptions = {
        outputFileName: join(__dirname, './test/.spec/myApi.spec.ts'),
        routesTypeName: 'MyApiRoutes',
        routesImport: `import {MyApiRoutes} from '../myApi.types';`,
        version: '0.2.1',
        packageName: '@mikrokit/myApiSpec',
    };

    addSpecRoutes(myApiRoutes, generateOptions, {prefix: 'api/v1', suffix: '.json'});

    it('generate a typescript spec file without typescript errors', () => {
        expect(true).toEqual(true);
    });

    it('create api spec using the public paths, display only hooks that either accept or return data and remove prefix, suffix', () => {
        const apiSpec = getApiSpec();
        expect(apiSpec).toEqual({
            users: {
                getUser: [
                    expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                    expect.objectContaining({isRoute: true, path: '/api/v1/users/getUser.json'}),
                    expect.objectContaining({isRoute: false, fieldName: 'totalUsers'}),
                ],
                setUser: [
                    expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                    expect.objectContaining({isRoute: true, path: '/api/v1/users/setUser.json'}),
                    expect.objectContaining({isRoute: false, fieldName: 'totalUsers'}),
                ],
            },
            pets: {
                getPet: [
                    expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                    expect.objectContaining({isRoute: true, path: '/api/v1/pets/getPet.json'}),
                ],
                setPet: [
                    expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                    expect.objectContaining({isRoute: true, path: '/api/v1/pets/setPet.json'}),
                ],
            },
            utils: {
                getNumber: [
                    expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                    expect.objectContaining({isRoute: true, path: '/api/v1/utils/getNumber.json'}),
                ],
            },
            getItem: [
                expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                expect.objectContaining({isRoute: true, path: '/api/v1/getItem.json'}),
            ],
            getPetOrUser: [
                expect.objectContaining({isRoute: false, fieldName: 'auth'}),
                expect.objectContaining({isRoute: true, path: '/api/v1/getPetOrUser.json'}),
            ],
        });
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

    const routeCountry = (ctx, country: CountryKey): CountryKey => country;
    const routeSimpleUser = (ctx, user: SimpleUser): SimpleUser => user;
    const routeDataPoint = (ctx, dataPoint: DataPoint): DataPoint => dataPoint;
    const routeAndUser = (ctx, andUser: AndUser): AndUser => andUser;
    const routeOrUser = (ctx, orUser: OrUser): OrUser => orUser;
    const routeExtendedUser = (ctx, extendedUser: ExtendedUser): ExtendedUser => extendedUser;

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
