/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// export diferent types using clases, interfaces, unions extends etc...

export interface BaseModel {
    id: string;
}

export interface Model extends BaseModel {
    name: string;
}

export class Model1 implements Model {
    id: string;
    name: string;
}

export type Model2 = Model1 & {phone: string};

export type Model3 = Pick<Model2, 'phone'>;

export class Entity<T> {
    constructor(model: T) {}
}
