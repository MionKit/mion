/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Route} from '@mikrokit/router';
import {initAwsLambdaApp} from './awsLambda';
import createEvent from '@serverless/event-mocks';
import {APIGatewayProxyEventHeaders} from 'aws-lambda';

describe('serverless router should', () => {
    // MkRouter.forceConsoleLogs();
    type SimpleUser = {
        name: string;
        surname: string;
    };
    type DataPoint = {
        date: Date;
    };
    const app = {
        cloudLogs: {
            log: () => null,
            error: () => null,
        },
        db: {
            changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
        },
    };
    const getSharedData = () => ({auth: {me: null as any}});

    const {emptyContext, lambdaHandler, MkRouter} = initAwsLambdaApp(app, getSharedData, {prefix: 'api/'});
    type CallContext = typeof emptyContext;

    const changeUserName: Route = (context: CallContext, user: SimpleUser) => {
        return context.app.db.changeUserName(user);
    };

    const getDate: Route = (context: CallContext, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
    };

    const updateHeaders: Route = (context: CallContext): void => {
        context.response.headers['x-something'] = true;
        context.response.headers['server'] = 'my-server';
        context.serverContext.awsContext;
    };

    MkRouter.addRoutes({changeUserName, getDate, updateHeaders});

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
        const requestData = {'/api/getDate': [{date: new Date('April 10, 2022 03:24:00')}]};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

        const awsResponse = await lambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        expect(parsedResponse).toEqual({'/api/getDate': {date: '2022-04-10T01:24:00.000Z'}});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual(52);
        expect(headers['server']).toEqual('@mikrokit/serverless');
    });

    it('should get an error when sending invalid parameters', async () => {
        const requestData = {'/api/getDate': ['NOT A DATE POINT']};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/getDate');

        const awsResponse = await lambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        const expectedError = {
            message: `Invalid input '/api/getDate', can not deserialize. Parameters might be of the wrong type.`,
            statusCode: 400,
        };
        expect(parsedResponse).toEqual({errors: [expectedError]});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual(133);
        expect(headers['server']).toEqual('@mikrokit/serverless');
    });

    it('should set response headers from route response', async () => {
        const requestData = {};
        const {event, context} = getDefaultGatewayEvent(JSON.stringify(requestData), '/api/updateHeaders');

        const awsResponse = await lambdaHandler(event, context);
        const parsedResponse = JSON.parse(awsResponse.body);
        const headers = awsResponse.headers || {};

        expect(parsedResponse).toEqual({});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual(2);
        expect(headers['server']).toEqual('my-server');
        expect(headers['x-something']).toEqual(true);
    });
});
