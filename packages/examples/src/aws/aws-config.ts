import {createAwsLambdaHandler} from '@mionjs/platform-aws';
import {mion, routes} from './aws-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

export const handler = createAwsLambdaHandler({});
