/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeOf, ReceiveType, resolveReceiveType, reflect} from '@deepkit/type';
import {getOutputSerializer, getParamsDeserializer, getParamValidators} from './reflection';
import {Context, isFunctionType, RouteParamValidator, Routes} from './types';
import {DEFAULT_ROUTE_OPTIONS} from './constants';
import {HookString, SHook, SRoute, RouteDef} from './static-types';
import {inspect} from 'util';
import {API} from './constants';

const printS = {showHidden: true, depth: 8, colors: true};

// bellow tests doesn't need to be run every time is just investigation work
// eslint-disable-next-line jest/no-disabled-tests
describe('Static types reflection exploratory work', () => {
    type HookConfig<T extends {areaName: string}> = {__meta?: ['hookConfig', T]};
    type UserMeta<T extends {areaName: string}> = {__meta?: ['userMeta', T]};
    type Fn = (...args: any[]) => any;

    it('type info from reflection', () => {
        type F2<T extends {areaName: string}> = Fn & HookConfig<T>;
        const hook: F2<{areaName: 'sayHelloF'}> = (a, b) => a + b;
        console.log('####### type info from reflection #######');
        console.log('reflect', inspect(reflect(hook), printS));
        expect(true).toEqual(true);
    });

    it('type info from type', () => {
        type F2 = Fn & HookConfig<{areaName: 'sayHelloF'}>;
        const f2Type = typeOf<F2>(); // using the explicitly declared type works
        console.log('####### type info from type #######');
        console.log('type', inspect(f2Type, printS));
        expect(true).toEqual(true);
    });

    it('type info using typeof', () => {
        type User = {name: string};
        const user: User & HookConfig<{areaName: 'US'}> = {name: 'tony'};
        // using typeof X does not preserve the type info as is considered inference
        console.log('####### type info using typeof #######');
        console.log('type', inspect(typeOf<typeof user>(), printS));
        expect(true).toEqual(true);
    });

    it('type info from (class)', () => {
        class User1 {
            public name: string & UserMeta<{areaName: 'UE'}>;
            constructor(name) {
                this.name = name;
            }
        }
        const user1: User1 = new User1('toby');
        console.log('####### type info from (class) #######');
        console.log('class typeOf', inspect(typeOf<User1>(), printS));
        // refelct does not work in objects
        // console.log('class reflect', inspect(reflect(user1), printS));
        expect(true).toEqual(true);
    });

    it('type info from (Interface)', () => {
        type User2 = {
            name: string & UserMeta<{areaName: 'US'}>;
        };
        const user2: User2 = {name: 'tony'};
        console.log('####### type info from (Interface) #######');
        console.log('interface type', inspect(typeOf<User2>(), printS));
        // refelct does not work in objects
        // console.log('interface reflect', inspect(reflect(user2), printS));
        expect(true).toEqual(true);
    });

    it('type info from receivedType', () => {
        console.log('####### type info from receivedType #######');
        // using receivedType seem to be correct Mechanism to declare config as types
        function hookF<T extends {hookName: string}>(hook: (...args: any[]) => any, type?: ReceiveType<T>) {
            type = resolveReceiveType(type);
            console.log('receivedType', inspect(type, printS));
            const result = {hook};
            return result as T & typeof result;
        }
        const hook1 = hookF<{hookName: 'sum'}>((a: number, b: number) => a + b);
        expect(true).toEqual(true);
    });

    it('passing class as parameters for function', () => {
        console.log('####### type info from receivedType #######');
        class User1 {
            public name: string & UserMeta<{areaName: 'UE'}>;
            constructor(name) {
                this.name = name;
            }
        }
        interface User2 {
            name: string & UserMeta<{areaName: 'US'}>;
        }
        function typeFromClass(c: any) {
            console.log('typeFromClass', inspect(c, printS));
            console.log('class reflect', inspect(reflect(c), printS));
        }

        typeFromClass(User1);
        // interfaces can't be used as those are pure types and gets completelly erased during compilie time
        // typeFromClass(User2);
        expect(true).toEqual(true);
    });

    it('using receivedType for client', () => {
        type Rute<Args extends any[]> = (...args: Args) => any;

        function client<T>(type?: ReceiveType<T>) {
            console.log('type', inspect(type, printS));
            const rtype = resolveReceiveType(type);
            console.log('receivedType client', inspect(rtype, printS));
        }

        const auth: Rute<[string]> = (token): boolean => token === 'ABC';
        const counter = Math.random();

        const api = {
            auth,
            abc: 'hello',
            cdf: true,
            acd: counter === 0.91,
        };

        console.log('typeof testApi');
        client<API>();

        console.log('typeof api');
        client<typeof api>();
        //console.log('interface reflect', inspect(reflect(api), printS));
        expect(true).toEqual(true);
    });
});
