import {initMionGcloud} from '@mionkit/gcloud';
import {routes} from './gcloud-routes.ts';

export const api = initMionGcloud(routes);
