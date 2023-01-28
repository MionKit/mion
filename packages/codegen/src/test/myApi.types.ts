/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type User = {id: number; name: string; surname: string};
export type Pet = {id: number; race: string; name: string};

export type Item<I> = {
    item: I;
};

export type {MyApiRoutes} from './myApi.routes';
