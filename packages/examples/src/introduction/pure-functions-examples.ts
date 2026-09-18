/* eslint-disable */
// Code examples for the pure functions documentation page.
import {initClient, batch, inputFrom} from '@mionjs/client';
import type {MyApi} from '../codegen/routes-example.ts';

// ========================================
// inputFrom (client → server data mapping)
// ========================================

// start:map-from-basic
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const created = routes.users.create({name: 'Jane', email: 'jane@example.com'});
// inputFrom maps created.id → users.getById input; the mapping function runs server-side.
const idMapping = inputFrom(created, (user) => user!.id);
const fetched = routes.users.getById(idMapping.asArg());

const [[createdData, fetchedData]] = await batch([created, fetched]).call();
console.log(`Fetched ${fetchedData?.name}`);
// end:map-from-basic

export {};
