/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MkRouter, Context, MapObj, SharedDataFactory, RouterOptions, StatusCodes} from '@mikrokit/router';
import {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {isMethodAllowed, JSON_TYPE_HEADER} from './constants';

export type AwsServerCall = {
    req: APIGatewayEvent;
    awsContext: AwsContext;
};

export type AwsCallContext<App extends MapObj, SharedData extends MapObj> = Context<App, SharedData, APIGatewayEvent>;

export const initAWSApp = <App extends MapObj, SharedData extends MapObj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<APIGatewayEvent>>,
) => {
    type CallContext = AwsCallContext<App, SharedData>;
    MkRouter.initRouter(app, handlersDataFactory, routerOptions);
    const emptyContext: CallContext = {} as CallContext;
    return {emptyContext, lambdaHandler};
};

const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    if (!isMethodAllowed(req.httpMethod))
        return {
            statusCode: StatusCodes.METHOD_NOT_ALLOWED,
            headers: JSON_TYPE_HEADER,
            body: '{}',
        };

    const serverCall: AwsServerCall = {req, awsContext};
    const resp = await MkRouter.runRoute_(req.path, serverCall);
    return {
        statusCode: resp.statusCode,
        headers: {
            ...resp.headers,
            ...JSON_TYPE_HEADER,
        },
        body: resp.json,
    };
};
