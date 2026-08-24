// Same signature SHAPE as fn_a.ts but the param is named `b` — different
// canonical node with its own param name. Both call shapes.
import {getRunTypeId} from '@ts-runtypes/core';

export const idStatic = getRunTypeId<(b: string) => number>();

const value: (b: string) => number = (b) => b.length;
export const idReflect = getRunTypeId(value);
