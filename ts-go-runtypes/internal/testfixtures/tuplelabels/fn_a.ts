// Function type `(a: string) => number` — param NAMES are id-relevant so the
// projected parameter node's name is reliable. Both call shapes.
import {getRunTypeId} from '@ts-runtypes/core';

export const idStatic = getRunTypeId<(a: string) => number>();

const value: (a: string) => number = (a) => a.length;
export const idReflect = getRunTypeId(value);
