import {initMionGcloud} from '@mionkit/gcloud';
import {routes} from './routes';

export const api = initMionGcloud(routes);

