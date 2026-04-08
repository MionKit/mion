import {initClient, routesFlow} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const controller = new AbortController();

// cancellation works with middleFns
const [result, error, mfResults, mfErrors] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({
    middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))},
    timeout: 5000,
    signal: controller.signal,
});

// and with routesFlow
const [[sum, greeting], [sumError, greetingError]] = await routesFlow([
    routes.utils.sum(5, 2),
    routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}),
]).call({
    middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))},
    timeout: 10_000,
});
