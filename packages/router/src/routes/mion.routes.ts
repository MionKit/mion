import {Routes} from '../types/general';
import {PublicApi} from '../types/publicMethods';
import {mionClientRoutes} from './client.routes';
import {mionUnexpectedErrorRoute} from './globalError.routes';

export const mionRoutes = {
    ...mionClientRoutes,
    ...mionUnexpectedErrorRoute,
} satisfies Routes;

export type MionRoutes = PublicApi<typeof mionRoutes>;
