/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ApiRouterOptions, ApiRoute, ApiRouteOptions, ApiRoutes} from './types';
import {getNonApiRouteItems} from './utils';

function addApiRoute(path: string, route: ApiRoute<any, any>) {}

function addApiRouteOptions(path: string, route: ApiRouteOptions<any, any>) {}

export function addApiRoutes(path: string, routes: ApiRoutes) {}

export async function parseApiModule(filePath: string): Promise<ApiRoutes> {
    const module = await import(filePath);
    const nonRoutes = getNonApiRouteItems(module);
    if (nonRoutes.length) {
        const invalidExports = nonRoutes.map((entry) => entry[0]).join(',');
        throw new Error(
            `File '${filePath}' contains invalid exported properties [${invalidExports}] that are not routes.` +
                `\nAll exported properties must match ApiRoute or ApiRouteOptions type.`,
        );
    }
    return module as ApiRoutes;
}

function validateApiModue() {}
