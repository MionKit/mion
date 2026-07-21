/* eslint-disable */
// Code examples for the pure functions documentation page.
import {registerMionPureFn} from '@mionjs/run-types';
import {initClient, routesFlow, serverMapFrom} from '@mionjs/client';
import type {MyApi} from '../codegen/routes-example.ts';

// ========================================
// registerMionPureFn (server-side pure functions)
// ========================================

// start:register-factory-basic
// Register a server-side utility under a namespace. The factory returns the actual function,
// so any captured constants/dependencies are created once at registration time.
registerMionPureFn('myNamespace', () => {
    const MAX_ITEMS = 100;
    return function limitItems(items: any[]) {
        return items.slice(0, MAX_ITEMS);
    };
});
// end:register-factory-basic

// ========================================
// serverMapFrom (client → server data mapping)
// ========================================

// start:map-from-basic
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const created = routes.users.create({name: 'Jane', email: 'jane@example.com'});
// serverMapFrom maps created.id → users.getById input; the mapping function runs server-side.
const idMapping = serverMapFrom(created, (user) => user!.id);
const fetched = routes.users.getById(idMapping.asArg());

const [[createdData, fetchedData]] = await routesFlow([created, fetched]).call();
console.log(`Fetched ${fetchedData?.name}`);
// end:map-from-basic

export {};
