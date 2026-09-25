import {getRunTypeId} from '@mionjs/run-types';

// static form: pass the type, no value needed
const stringId = getRunTypeId<string>(); // e.g. "Sq3kZ1"
const userId = getRunTypeId<{id: number; name: string}>();

// value form: T is inferred from `order`, which is ignored at runtime
const order = {id: 1, total: 42};
const orderId = getRunTypeId(order);

export {stringId, userId, orderId};
