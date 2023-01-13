/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Router, Context, Obj, SharedDataFactory, RouterOptions} from '@mikrokit/router';
import {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

export type AwsServerCall = {
    req: APIGatewayEvent;
    awsContext: AwsContext;
};

let defaultResponseContentType: string;

export type AwsCallContext<App extends Obj, SharedData extends Obj> = Context<App, SharedData, APIGatewayEvent, AwsServerCall>;

export const initAwsLambdaApp = <App extends Obj, SharedData extends Obj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<APIGatewayEvent>>
) => {
    type CallContext = AwsCallContext<App, SharedData>;
    Router.initRouter(app, handlersDataFactory, routerOptions);
    defaultResponseContentType = Router.getRouterOptions().responseContentType;
    const emptyContext: CallContext = {} as CallContext;
    return {emptyContext, lambdaHandler, Router};
};

const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    const serverCall: AwsServerCall = {req, awsContext};
    const routeResponse = await Router.runRoute_(req.path, serverCall);
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
