import {createAwsLambdaHandler} from '@mionjs/platform-aws';
import {initMionRouter} from '@mionjs/router';
import {routes} from './aws-routes.ts';

await initMionRouter(routes, {
    basePath: 'api', // API prefix
});

export const handler = createAwsLambdaHandler({});
