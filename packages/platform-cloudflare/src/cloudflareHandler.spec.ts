/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts, setCloudflareHandlerOpts} from './cloudflareHandler.ts';
import type {CallContext, Route} from '@mionjs/router';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

describe('cloudflare handler', () => {
  type SimpleUser = {
    name: string;
    surname: string;
  };
  type DataPoint = {
    date: Date;
  };
  type MySharedData = ReturnType<typeof getSharedData>;
  type Context = CallContext<MySharedData>;

  const myApp = {
    db: {
      changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
  };
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

  const changeUserNameHandler = (ctx: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
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

  // Every call in this file posts a JSON body; the unused method/headers parameters
  // only made the request look like it might carry a body on a GET.
  const createRequest = (body: string, path: string) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      body,
      headers: {'content-type': 'application/json'},
    });

  describe('with a direct return (the stringifyJson framing)', () => {
    let handler: ReturnType<typeof createCloudflareHandler>;

    beforeAll(async () => {
      resetCloudflareHandlerOpts();
      setCloudflareHandlerOpts({basePath: ''});
      mion.initRoutes(directRoutes);
      handler = createCloudflareHandler();
    });

    it('should get an ok response from a route', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const req = createRequest(JSON.stringify(requestData), '/api/getDate');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
      expect(response.headers.get('server')).toEqual('@mionjs');
    });

    it('should get an error when sending invalid parameters', async () => {
      const requestData = {getDate: ['NOT A DATE POINT']};
      const req = createRequest(JSON.stringify(requestData), '/api/getDate');

      const response = await handler.fetch(req);
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
      const req = createRequest(JSON.stringify(requestData), '/api/updateHeaders');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({});
      expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
      expect(response.headers.get('server')).toEqual('my-server');
      expect(response.headers.get('x-something')).toEqual('true');
    });

    it('should include default headers', async () => {
      resetCloudflareHandlerOpts();
      mion.initRoutes(directRoutes);
      setCloudflareHandlerOpts({
        basePath: '',
        defaultResponseHeaders: {
          'x-app-name': 'MyApp',
          'x-instance-id': '3089',
        },
      });
      handler = createCloudflareHandler();

      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const req = createRequest(JSON.stringify(requestData), '/api/getDate');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(response.headers.get('x-app-name')).toEqual('MyApp');
      expect(response.headers.get('x-instance-id')).toEqual('3089');
      expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
      expect(response.headers.get('server')).toEqual('@mionjs');

      // Restore state
      resetCloudflareHandlerOpts();
      setCloudflareHandlerOpts({basePath: ''});
      mion.initRoutes(directRoutes);
      handler = createCloudflareHandler();
    });
  });

  describe('with basePath stripping', () => {
    let handler: ReturnType<typeof createCloudflareHandler>;

    beforeAll(async () => {
      resetCloudflareHandlerOpts();
      setCloudflareHandlerOpts({basePath: '/api/mion'});
      mion.initRoutes({changeUserName, getDate});
      handler = createCloudflareHandler();
    });

    it('should strip basePath and route correctly', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const req = createRequest(JSON.stringify(requestData), '/api/mion/api/getDate');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(response.status).toBe(200);
    });
  });

  describe('with the default mutate return (the json framing)', () => {
    let handler: ReturnType<typeof createCloudflareHandler>;

    beforeAll(async () => {
      resetCloudflareHandlerOpts();
      setCloudflareHandlerOpts({basePath: ''});
      const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
      jsonRouter.initRoutes({changeUserName, getDate});
      handler = createCloudflareHandler();
    });

    it('should get an ok response from a route with Date objects', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const req = createRequest(JSON.stringify(requestData), '/api/getDate');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      // Response.json() adds charset=utf-8 automatically
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('server')).toEqual('@mionjs');
    });

    it('should get an ok response from a route with complex objects', async () => {
      const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
      const req = createRequest(JSON.stringify(requestData), '/api/changeUserName');

      const response = await handler.fetch(req);
      const parsedResponse = await response.json();

      expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('server')).toEqual('@mionjs');
    });
  });
});
