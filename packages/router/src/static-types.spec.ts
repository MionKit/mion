/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeOf, ReceiveType, resolveReceiveType, reflect} from '@deepkit/type';
import {getOutputSerializer, getParamsDeserializer, getParamValidators} from './reflection';
import {Context, isFunctionType, RouteParamValidator} from './types';
import {DEFAULT_ROUTE_OPTIONS} from './constants';
import {HookString, SHook, SRoute, RouteDef} from './static-types';
import {inspect} from 'util';

const printS = {showHidden: true, depth: 8, colors: true};

// bellow tests doesn't need to be run every time is just investigation work
// eslint-disable-next-line jest/no-disabled-tests
describe('Static types reflection exploratory work', () => {
    type HookConfig<T extends {areaName: string}> = {__meta?: ['hookConfig', T]};
    type Fn = (...args: any[]) => any;

    it('type info from reflection', () => {
        type F2<T extends {areaName: string}> = Fn & HookConfig<T>;
        const hook: F2<{areaName: 'sayHelloF'}> = (a, b) => a + b;
        console.log('reflect', inspect(reflect(hook), printS));
        expect(true).toEqual(true);
    });

    it('type info from type', () => {
        type F2 = Fn & HookConfig<{areaName: 'sayHelloF'}>;
        const f2Type = typeOf<F2>(); // using the explicitly declared type works
        console.log('type', inspect(f2Type, printS));
        expect(true).toEqual(true);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it('type info from typeof Type (class)', () => {
        type UserMeta<T extends {areaName: string}> = {__meta?: ['hookConfig', T]};
        class User1<T extends {areaName: string}> {
            public name: string & UserMeta<T>;
            constructor(name) {
                this.name = name;
            }
        }
        const user1: User1<{areaName: 'UE'}> = new User1('toby');
        // using typeof X does not preserve the type info as is considered inference
        console.log('class', inspect(typeOf<typeof user1>(), printS));
        expect(true).toEqual(true);
    });

    it('type info from typeof Type (Interface)', () => {
        type User2 = {name: string};
        const user2: User2 & HookConfig<{areaName: 'US'}> = {name: 'tony'};
        console.log('type', inspect(typeOf<typeof user2>(), printS));
        expect(true).toEqual(true);
    });

    it('type info from receivedType', () => {
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
});
