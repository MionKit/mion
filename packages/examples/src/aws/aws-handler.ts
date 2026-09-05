import {createAwsLambdaHandler} from '@mionjs/platform-aws';
import {mion, routes} from './aws-routes.ts';

await mion.initRoutes(routes);

export const handler = createAwsLambdaHandler();
