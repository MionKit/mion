import {getRunTypeId} from '@mionjs/run-types';

// Static form: you bring the type, you get its id. No value needed.
const stringId = getRunTypeId<string>(); // e.g. "Sq3kZ1"
const userId = getRunTypeId<{id: number; name: string}>();

// Reflection form: T is inferred from a value. The value is only read for
// its type; at runtime it's ignored, so nothing leaks into the output.
const order = {id: 1, total: 42};
const orderId = getRunTypeId(order);

// Same shape in, same id out: getRunTypeId<{id: number}>() and a value of
// that shape resolve to the exact same string.
export {stringId, userId, orderId};
