/* eslint-disable */
// Code examples for the pure functions documentation page.
import {registerPureFn} from '@mionjs/run-types';
import {allowInputMapper, inputMapperKey} from '@mionjs/core';
import {initClient, batch, inputFrom} from '@mionjs/client';
import type {MyApi} from '../codegen/routes-example.ts';

// ========================================
// inputFrom, NAME lane (server-registered mapper)
// ========================================

// start:register-named-mapper
// Registration is the resolver's job, mion has no pure-fn registry of its own. A literal key plus
// an inline function literal is what the build scanner requires.
registerPureFn('mionjs::limitItems', (items: any[]) => items.slice(0, 100));

// mion's half: opt the key in as a batch input mapper. Without this the function is registered
// but deliberately unreachable from a batch table.
allowInputMapper(inputMapperKey('limitItems'));
// end:register-named-mapper

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
