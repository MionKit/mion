/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, getRouterOptions, dispatchRoute} from '@mikrokit/router';
import type {Obj, SharedDataFactory, RouterOptions} from '@mikrokit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import type {AwsRawServerContext} from './types';

let defaultResponseContentType: string;

export const initAwsLambdaApp = <App extends Obj, SharedData extends Obj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<AwsRawServerContext>>
) => {
    initRouter<App, SharedData, AwsRawServerContext>(app, handlersDataFactory, routerOptions);
    defaultResponseContentType = getRouterOptions().responseContentType;
};

export const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    const serverContext: AwsRawServerContext = {rawRequest: req, awsContext};
    const routeResponse = await dispatchRoute(req.path, serverContext);
    return {
        statusCode: routeResponse.statusCode,
        headers: {
            'content-type': defaultResponseContentType,
            'content-length': routeResponse.json.length,
            server: '@mikrokit/serverless',
            ...routeResponse.headers,
        },
        body: routeResponse.json,
    };
};
