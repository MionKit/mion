import {initMionAws} from '@mionkit/platform-aws';
import {routes} from './aws-routes.ts';

export const handler = initMionAws(routes);
