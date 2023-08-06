/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PATH_SEPARATOR, ROUTER_ITEM_SEPARATOR_CHAR, ROUTE_PATH_ROOT} from './constants';

/**
 * Get the router id for Routes or Hooks
 * @param itemPointer - The pointer to the item within the Routes object
 * i.e:
 * const routes = {
 *   auth: () => {},
 *   users: {
 *    getUser: () => {}
 *   }
 *   login: () => {}
 * }
 *
 * then the pointer for getUser is => ['users', 'getUser']
 */
export function getRouterItemId(itemPointer: string[]) {
    return itemPointer.join(ROUTER_ITEM_SEPARATOR_CHAR);
}

/** Gets a route path from a route pointer */
export function getRoutePath(pathPointer: string[], routerOptions: {prefix: string; suffix: string}) {
    const pathId = getRouterItemId(pathPointer);
    const prefix = routerOptions.prefix.startsWith(ROUTE_PATH_ROOT)
        ? routerOptions.prefix
        : `${ROUTE_PATH_ROOT}${routerOptions.prefix}`;
    const routePath = prefix.endsWith(PATH_SEPARATOR) ? `${prefix}${pathId}` : `${prefix}${PATH_SEPARATOR}${pathId}`;
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}
