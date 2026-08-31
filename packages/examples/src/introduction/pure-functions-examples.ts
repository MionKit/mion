/* eslint-disable */
// Code examples for the pure functions documentation page.
import {registerPureFn} from '@mionjs/run-types';
import {allowServerMapper, serverMapperKey} from '@mionjs/core';
import {initClient, routesFlow, serverMapFrom} from '@mionjs/client';
import type {MyApi} from '../codegen/routes-example.ts';

// ========================================
// serverMapFrom, NAME lane (non-Vite clients)
// ========================================

// start:register-named-mapper
// Registration is @ts-runtypes' job — mion has no pure-fn registry of its own. A literal key plus
// an inline function literal is what the build scanner requires.
registerPureFn('mionjs::limitItems', (items: any[]) => items.slice(0, 100));

// mion's half: opt the key into wire-reachability. Without this the mapper is registered but
// deliberately unreachable, because the key a routesFlow request names is attacker-controlled.
allowServerMapper(serverMapperKey('limitItems'));
// end:register-named-mapper

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
