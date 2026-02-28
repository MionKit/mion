/* eslint-disable */
// This file provides code examples for the pure functions documentation page
import {pureServerFn, registerPureFnFactory} from '@mionkit/core';
import {initClient, routesFlow, mapFrom} from '@mionkit/client';
import type {MyApi} from '../client/server.routes.ts';

// ========================================
// registerPureFnFactory (Server → Client)
// ========================================

// start:register-factory-basic
// Register a validation utility on the server
registerPureFnFactory('myNamespace', 'limitItems', function (jitUtils) {
    const MAX_ITEMS = 100;
    return function inner(items: any[]) {
        return items.slice(0, MAX_ITEMS);
    };
});

// Register a factory that depends on another pure function
registerPureFnFactory('myNamespace', 'validateAndLimit', function (jitUtils) {
    const limitFn = jitUtils.getPureFn('myNamespace', 'limitItems');
    return function inner(items: any[]) {
        const filtered = items.filter((item) => item != null);
        return limitFn(filtered);
    };
});
// end:register-factory-basic

// ========================================
// pureServerFn (Client → Server)
// ========================================

// start:pure-server-fn-basic
// Simple pure function — defined in client, runs on server
const double = pureServerFn((x: number) => x * 2);

// Named pure function
const compute = pureServerFn(function addOne(x: number) {
    const result = x + 1;
    return result;
});

// Factory variant — called once at server init to create the actual function
const validate = pureServerFn({
    pureFn: function factory() {
        const regex = new RegExp('^[a-z]+$');
        return function inner(s: string) {
            return regex.test(s);
        };
    },
    isFactory: true,
});
// end:pure-server-fn-basic

// ========================================
// mapFrom (Client → Server)
// ========================================

// start:map-from-basic
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const order = routes.orders.getById('ORDER-123');
// mapFrom maps order.userId → users.getById input (runs server-side)
const mapping = mapFrom(order, (o) => o!.userId);
// fake() returns a typed placeholder that satisfies the TypeScript compiler
const user = routes.users.getById(mapping.type());

const [[orderData, userData]] = await routesFlow([order, user]);
console.log(`Order by ${userData?.name}`);
// end:map-from-basic

export {};
