/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions} from './types';

export const DEFAULT_CORE_OPTIONS: CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: false,
};

export const GET_PUBLIC_METHODS_ID = 'mionGetPublicMethodsInfo';

export const ROUTER_ITEM_SEPARATOR_CHAR = '-';

// TODO move this to its own file whe we add more functionality to core package
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
