/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MkRouter, Context, MapObj, SharedDataFactory, RouterOptions} from '@mikrokit/router';
import {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

export type AwsServerCall = {
    req: APIGatewayEvent;
    awsContext: AwsContext;
};

const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    const serverCall: AwsServerCall = {
        req,
        awsContext,
    };
    const resp = await MkRouter.runRouteWithServerCall(req.path, serverCall);
    const body = resp.errors.length ? JSON.stringify({errors: resp.errors}) : JSON.stringify(resp.body);
    return {
        statusCode: resp.statusCode,
        headers: {
            ...resp.headers,
            'Content-Type': 'application/json',
        },
        body,
    };
};

export const initApp = <App extends MapObj, SharedData extends MapObj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions>,
) => {
    type CallContext = Context<App, SharedData, APIGatewayEvent>;
    MkRouter.initRouter(app, handlersDataFactory, routerOptions);
    const emptyContext: CallContext = {} as any;
    return {emptyContext, lambdaHandler};
};
