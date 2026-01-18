import {initMionAws} from '@mionkit/aws';
import {routes} from './routes';

export const handler = initMionAws(routes);

