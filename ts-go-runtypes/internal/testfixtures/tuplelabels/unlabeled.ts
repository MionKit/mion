// Unlabeled `[string]` — its own canonical node, distinct from every labeled
// variant of the same shape. Both call shapes.
import {getRunTypeId} from '@ts-runtypes/core';

export const idStatic = getRunTypeId<[string]>();

const value: [string] = ['plain'];
export const idReflect = getRunTypeId(value);
