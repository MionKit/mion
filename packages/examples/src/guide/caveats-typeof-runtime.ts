import {getRunTypeId} from '@ts-runtypes/core';

type User = {id: number; name: string};
const user: User = {id: 1, name: 'Ada'};

// `getRunTypeId<T>()` wants a TYPE. To go from a value, use the TS `typeof`
// type operator (not the runtime `typeof`), or just reach for reflect.
const byType = getRunTypeId<typeof user>(); // TS typeof: the type of `user`
const byValue = getRunTypeId(user); // same thing, from the value

// Heads up: the runtime `typeof` operator returns a string like 'object',
// that's a value, not a type, and won't help ts-runtypes.
const runtimeTag = typeof user; // 'object' (just a string, unrelated)

export {byType, byValue, runtimeTag};
