// Same SHAPE as labeled_s.ts (`[string]`) but a different LABEL — must be a
// DIFFERENT canonical node carrying its own label. Both call shapes again.
import {getRunTypeId} from '@ts-runtypes/core';

export const idStatic = getRunTypeId<[name: string]>();

const value: [name: string] = ['world'];
export const idReflect = getRunTypeId(value);
