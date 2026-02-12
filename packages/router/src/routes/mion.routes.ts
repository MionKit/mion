import {Routes} from '../types/general.ts';
import {PublicApi} from '../types/publicMethods.ts';
import {mionClientRoutes} from './client.routes.ts';
import {mionErrorsRoutes} from './errors.routes.ts';

export const mionRoutes = {
    ...mionClientRoutes,
    ...mionErrorsRoutes,
} as const satisfies Routes;

export type MionRoutes = PublicApi<typeof mionRoutes>;
