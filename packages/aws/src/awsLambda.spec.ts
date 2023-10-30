/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, registerRoutes} from '@mionkit/router';
import {awsLambdaHandler, resetAwsLambdaOpts, setAwsLambdaOpts} from './awsLambda';
import createEvent from '@serverless/event-mocks';
import type {CallContext, Route} from '@mionkit/router';
import type {APIGatewayProxyEventHeaders} from 'aws-lambda';
import {AnonymRpcError} from '@mionkit/core';

describe('serverless router should', () => {
    // Router.forceConsoleLogs();
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

    const changeUserName: Route = (ctx: Context, user: SimpleUser) => {
        return myApp.db.changeUserName(user);
    };

    const getDate: Route = (ctx: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
    };

    const updateHeaders: Route = (context: Context): void => {
        context.response.headers.set('x-something', 'true');
        context.response.headers.set('server', 'my-server');
    };

    beforeAll(async () => {
        resetAwsLambdaOpts();
        initRouter({sharedDataFactory: getSharedData, prefix: 'api/'});
        registerRoutes({changeUserName, getDate, updateHeaders});
    });

    const getDefaultGatewayEvent = (
        body: string,
        path: string,
        httpMethod = 'POST',
        headers: APIGatewayProxyEventHeaders = {}
    ) => {
        const context = {} as any;
        const event = createEvent('aws:apiGateway', {
            body,
            headers,
            multiValueHeaders: {},
            httpMethod,
            isBase64Encoded: false,
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

    it('should get an ok response from a route', async () => {
        const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

        const awsResponse = await awsLambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('47');
        expect(headers['server']).toEqual('@mionkit/aws');
    });

    it('should get an error when sending invalid parameters', async () => {
        const requestData = {getDate: ['NOT A DATE POINT']};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

        const awsResponse = await awsLambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        const expectedError: AnonymRpcError = {
            message: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
            statusCode: 400,
            name: 'Serialization Error',
            errorData: expect.anything(),
        };
        expect(parsedResponse).toEqual({getDate: expectedError});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('254');
        expect(headers['server']).toEqual('@mionkit/aws');
    });

    it('should set response headers from route response', async () => {
        const requestData = {};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/updateHeaders');

        const awsResponse = await awsLambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        expect(parsedResponse).toEqual({});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('2');
        expect(headers['server']).toEqual('my-server');
        expect(headers['x-something']).toEqual('true');
    });

    it('get default headers', async () => {
        const routerOpts = {
            sharedDataFactory: getSharedData,
            prefix: 'api/',
        };
        const awsOpts = {
            defaultResponseHeaders: {
                'x-app-name': 'MyApp',
                'x-instance-id': '3089',
            },
        };
        resetAwsLambdaOpts();
        setAwsLambdaOpts(awsOpts);
        initRouter(routerOpts);
        registerRoutes({changeUserName, getDate, updateHeaders});
        const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

        const awsResponse = await awsLambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
        expect(headers['x-app-name']).toEqual('MyApp');
        expect(headers['x-instance-id']).toEqual('3089');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('47');
        expect(headers['server']).toEqual('@mionkit/aws');
    });
});
