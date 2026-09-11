/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {awsLambdaHandler, resetAwsLambdaOpts, setAwsLambdaOpts} from './awsLambda.ts';
import createEvent from '@serverless/event-mocks';
import type {CallContext, Route} from '@mionjs/router';
import type {APIGatewayProxyEventHeaders} from 'aws-lambda';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

describe('serverless router', () => {
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
    cloudLogs: {
      log: () => null,
      error: () => null,
    },
    db: {
      changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
  };
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

  const changeUserName: Route = mion.route((ctx: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
  });

  const getDate: Route = mion.route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
  });

  const updateHeaders: Route = mion.route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
  });

  const getDefaultGatewayEvent = (
    body: string,
    path: string,
    httpMethod = 'POST',
    headers: APIGatewayProxyEventHeaders = {},
    isBase64Encoded = false
  ) => {
    const context = {} as any;
    const event = createEvent('aws:apiGateway', {
      body,
      headers,
      multiValueHeaders: {},
      httpMethod,
      isBase64Encoded,
      path,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      // do not use context during test
      requestContext: context,
      resource: 'aws:apiGateway',
    });
    return {context, event};
  };

  describe('with the default encoder', () => {
    beforeAll(async () => {
      resetAwsLambdaOpts();
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders});
    });

    it('should get an ok response from a route', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      // expect(headers['content-length']).toEqual('47'); // AWS manages content-length automatically
      expect(headers['server']).toEqual('@mionjs');
    });

    it('should get an error when sending invalid parameters', async () => {
      const requestData = {getDate: ['NOT A DATE POINT']};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      const expectedError: PublicRpcError<'serialization-error'> = {
        'mion@isΣrrθr': true,
        publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
        type: 'serialization-error',
        errorData: {deserializeError: expect.any(String)},
        statusCode: StatusCodes.UNEXPECTED_ERROR,
      };
      expect(parsedResponse[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      // expect(headers['content-length']).toEqual('180'); // AWS manages content-length automatically
      expect(headers['server']).toEqual('@mionjs');
    });

    it('should set response headers from route response', async () => {
      const requestData = {};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/updateHeaders');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      expect(parsedResponse).toEqual({});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      // expect(headers['content-length']).toEqual('2'); // AWS manages content-length automatically
      expect(headers['server']).toEqual('my-server');
      expect(headers['x-something']).toEqual('true');
    });

    it('get default headers', async () => {
      const awsOpts = {
        defaultResponseHeaders: {
          'x-app-name': 'MyApp',
          'x-instance-id': '3089',
        },
      };
      resetAwsLambdaOpts();
      resetRouter();
      setAwsLambdaOpts(awsOpts);
      mion.initRoutes({changeUserName, getDate, updateHeaders});
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(headers['x-app-name']).toEqual('MyApp');
      expect(headers['x-instance-id']).toEqual('3089');
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      // expect(headers['content-length']).toEqual('47'); // AWS manages content-length automatically
      expect(headers['server']).toEqual('@mionjs');

      // Restore router state for subsequent tests
      resetAwsLambdaOpts();
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders});
    });
  });

  describe('with a base64 encoded body (isBase64Encoded: true)', () => {
    const toBase64 = (text: string) => Buffer.from(text).toString('base64');
    const getBase64GatewayEvent = (body: string, path: string) => getDefaultGatewayEvent(toBase64(body), path, 'POST', {}, true);

    beforeAll(async () => {
      resetAwsLambdaOpts();
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders});
    });

    it('serves a base64 encoded event exactly like its plain twin', async () => {
      const requestData = JSON.stringify({changeUserName: [{name: 'John', surname: 'Doe'}]});
      const plain = getDefaultGatewayEvent(requestData, '/api/changeUserName');
      const encoded = getBase64GatewayEvent(requestData, '/api/changeUserName');
      expect(encoded.event.body).not.toEqual(plain.event.body);

      const plainResponse = await awsLambdaHandler(plain.event, plain.context);
      const encodedResponse = await awsLambdaHandler(encoded.event, encoded.context);

      expect(encodedResponse).toEqual(plainResponse);
      expect(JSON.parse(encodedResponse.body)).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
      expect(encodedResponse.isBase64Encoded).toBeUndefined();
    });

    it('serves a base64 encoded event with Date objects like its plain twin', async () => {
      const requestData = JSON.stringify({getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]});
      const plain = getDefaultGatewayEvent(requestData, '/api/getDate');
      const encoded = getBase64GatewayEvent(requestData, '/api/getDate');

      const plainResponse = await awsLambdaHandler(plain.event, plain.context);
      const encodedResponse = await awsLambdaHandler(encoded.event, encoded.context);

      expect(encodedResponse).toEqual(plainResponse);
      expect(JSON.parse(encodedResponse.body)).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
    });

    it('leaves a plain body alone when isBase64Encoded is false', async () => {
      const requestData = JSON.stringify({changeUserName: [{name: 'John', surname: 'Doe'}]});
      const {event, context} = getDefaultGatewayEvent(requestData, '/api/changeUserName', 'POST', {}, false);

      const awsResponse = await awsLambdaHandler(event, context);

      expect(JSON.parse(awsResponse.body)).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
    });

    it('answers a base64 body that is not JSON with the parse error, never a crash', async () => {
      const {event, context} = getBase64GatewayEvent('not json at all', '/api/changeUserName');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);

      expect(awsResponse.statusCode).toEqual(StatusCodes.UNEXPECTED_ERROR);
      expect(parsedResponse[MION_ROUTES.thrownErrors]['mionDeserializeRequest'].type).toEqual('parsing-json-request-error');
    });

    it('a decoded body over maxBodySize is a 413', async () => {
      resetAwsLambdaOpts();
      resetRouter();
      createMionRouter({contextDataFactory: getSharedData, basePath: 'api/', maxBodySize: 50}).initRoutes({changeUserName});
      const requestData = JSON.stringify({changeUserName: [{name: 'John', surname: 'Doe'}]});
      expect(requestData.length).toBeGreaterThan(50);
      const {event, context} = getBase64GatewayEvent(requestData, '/api/changeUserName');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);

      expect(awsResponse.statusCode).toEqual(StatusCodes.PAYLOAD_TOO_LARGE);
      expect(parsedResponse[MION_ROUTES.thrownErrors]['mionDeserializeRequest'].type).toEqual('request-payload-too-large');

      // the limit measures the decoded text: a short body whose base64 form is over the limit is served
      const shortData = JSON.stringify({changeUserName: [{name: 'J', surname: 'D'}]});
      expect(shortData.length).toBeLessThanOrEqual(50);
      expect(toBase64(shortData).length).toBeGreaterThan(50);
      const short = getBase64GatewayEvent(shortData, '/api/changeUserName');
      const shortResponse = await awsLambdaHandler(short.event, short.context);
      expect(shortResponse.statusCode).toEqual(StatusCodes.OK);
      expect(JSON.parse(shortResponse.body)).toEqual({changeUserName: {name: 'NewName', surname: 'D'}});

      // Restore router state for subsequent tests
      resetAwsLambdaOpts();
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders});
    });
  });

  describe('with a router created in the block (default encoder)', () => {
    beforeAll(async () => {
      resetAwsLambdaOpts();
      resetRouter();
      const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
      jsonRouter.initRoutes({changeUserName, getDate});
    });

    it('should get an ok response from a route with Date objects (body type O)', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('should get an ok response from a route with complex objects (body type O)', async () => {
      const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
      const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/changeUserName');

      const awsResponse = await awsLambdaHandler(event, context);
      const parsedResponse = JSON.parse(awsResponse.body);
      const headers = awsResponse.headers || {};

      expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['server']).toEqual('@mionjs');
    });
  });
});
