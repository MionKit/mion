// Labeled tuple `[s: string]` — BOTH getRunTypeId call shapes (marker rule):
// the static form and the value-inferred reflect form must land on ONE id.
import {getRunTypeId} from '@mionjs/run-types';

export const idStatic = getRunTypeId<[s: string]>();

const value: [s: string] = ['hello'];
export const idReflect = getRunTypeId(value);
