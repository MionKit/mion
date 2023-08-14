/* eslint-disable */
import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
const port = 8076;
const baseURL = `http://localhost:${port}`;
const {methods, client} = initClient<MyApi>({baseURL});

// Autocomplete
const sumResult = await methods.users.getById('USER-123');
