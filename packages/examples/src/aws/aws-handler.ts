import {awsLambdaHandler} from '@mionjs/platform-aws';
import {initMionRouter} from '@mionjs/router';
import {routes} from './aws-routes.ts';

await initMionRouter(routes);

export const handler = awsLambdaHandler;
