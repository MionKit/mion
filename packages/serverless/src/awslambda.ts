/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MkRouter, Context, MapObj, SharedDataFactory, RouterOptions} from '@mikrokit/router';
import {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

export type AwsRawCallContext = {
    resp: null;
    req: APIGatewayEvent;
    awsContext: AwsContext;
};

let defaultResponseContentType: string;

export type AwsCallContext<App extends MapObj, SharedData extends MapObj> = Context<
    App,
    SharedData,
    APIGatewayEvent,
    AwsRawCallContext
>;

export const initAwsLambdaApp = <App extends MapObj, SharedData extends MapObj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<APIGatewayEvent>>
) => {
    type CallContext = AwsCallContext<App, SharedData>;
    MkRouter.initRouter(app, handlersDataFactory, routerOptions);
    defaultResponseContentType = MkRouter.getRouterOptions().responseContentType;
    const voidContextHandler: CallContext = {} as CallContext;
    return {voidContextHandler, lambdaHandler, MkRouter};
};

const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    const rawCallContext: AwsRawCallContext = {req, resp: null, awsContext};
    const routeResponse = await MkRouter.runRoute_(req.path, rawCallContext);
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
