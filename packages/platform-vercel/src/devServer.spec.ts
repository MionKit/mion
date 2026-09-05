/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter} from '@mionjs/router';
import {resetVercelHandlerOpts, setVercelHandlerOpts} from './vercelHandler.ts';
import {startVercelDevServer} from './devServer.ts';
import type {CallContext, Route} from '@mionjs/router';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

type SimpleUser = {
  name: string;
  surname: string;
};
type DataPoint = {
  date: Date;
};
type MySharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<MySharedData>;

const getSharedData = () => ({auth: {me: null as any}});
const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

const changeUserNameHandler = (ctx: Context, user: SimpleUser): SimpleUser => {
  return {name: 'NewName', surname: user.surname};
};
const changeUserName: Route = mion.route(changeUserNameHandler);

const getDateHandler = (ctx: Context, dataPoint?: DataPoint): DataPoint => {
  return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
};
const getDate: Route = mion.route(getDateHandler);

const updateHeadersHandler = (context: Context): void => {
  context.response.headers.set('x-something', 'true');
  context.response.headers.set('server', 'my-server');
};

// The same routes with a `direct` return (each member writes its own JSON string: the stringifyJson framing); the
// default `mutate` return hands the platform a value to stringify (the json framing).
const directRoutes = {
  changeUserName: mion.route(changeUserNameHandler, {serializer: {return: 'direct'}}),
  getDate: mion.route(getDateHandler, {serializer: {return: 'direct'}}),
  updateHeaders: mion.route(updateHeadersHandler, {serializer: {return: 'direct'}}),
};

const closeServer = (server: any) =>
  new Promise<void>((resolve) => {
    if (server && typeof server.close === 'function') server.close(() => resolve());
    else resolve();
  });

describe('vercel dev server (node) - a direct return, the stringifyJson framing', () => {
  const port = 8761;
  let server: any;

  beforeAll(async () => {
    resetVercelHandlerOpts();
    setVercelHandlerOpts();
    mion.initRoutes(directRoutes);
    server = await startVercelDevServer({port});
  });

  afterAll(async () => {
    await closeServer(server);
  });

  it('should get an ok response from a route', async () => {
    const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
    const response = await fetch(`http://localhost:${port}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: {'content-type': 'application/json'},
    });
    const parsedResponse = await response.json();

    expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
    expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
    expect(response.headers.get('server')).toEqual('@mionjs');
  });

  it('should get an error when sending invalid parameters', async () => {
    const requestData = {getDate: ['NOT A DATE POINT']};
    const response = await fetch(`http://localhost:${port}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: {'content-type': 'application/json'},
    });
    const parsedResponse = await response.json();

    const expectedError: PublicRpcError<'serialization-error'> = {
      'mion@isΣrrθr': true,
      publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
      type: 'serialization-error',
      errorData: {deserializeError: expect.any(String)},
      statusCode: StatusCodes.UNEXPECTED_ERROR,
    };
    expect(parsedResponse[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
    expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
    expect(response.headers.get('server')).toEqual('@mionjs');
  });

  it('should set response headers from route response', async () => {
    const requestData = {};
    const response = await fetch(`http://localhost:${port}/api/updateHeaders`, {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: {'content-type': 'application/json'},
    });
    const parsedResponse = await response.json();

    expect(parsedResponse).toEqual({});
    expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
    expect(response.headers.get('server')).toEqual('my-server');
    expect(response.headers.get('x-something')).toEqual('true');
  });
});

describe('vercel dev server (node) - the default mutate return, the json framing', () => {
  const port = 8763;
  let server: any;

  beforeAll(async () => {
    resetVercelHandlerOpts();
    setVercelHandlerOpts();
    const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
    jsonRouter.initRoutes({changeUserName, getDate});
    server = await startVercelDevServer({port});
  });

  afterAll(async () => {
    await closeServer(server);
  });

  it('should get an ok response from a route with Date objects', async () => {
    const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
    const response = await fetch(`http://localhost:${port}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: {'content-type': 'application/json'},
    });
    const parsedResponse = await response.json();

    expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('server')).toEqual('@mionjs');
  });

  it('should get an ok response from a route with complex objects', async () => {
    const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
    const response = await fetch(`http://localhost:${port}/api/changeUserName`, {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: {'content-type': 'application/json'},
    });
    const parsedResponse = await response.json();

    expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('server')).toEqual('@mionjs');
  });
});
