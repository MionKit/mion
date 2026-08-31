import {getRunTypeId} from '@mionjs/run-types';

// A stable id for any type, the reflection TypeScript refused to ship.
const userId = getRunTypeId<{id: number; name: string}>(); // e.g. "Ab3Xy7"

// Or let it be inferred from a runtime value.
const order = {id: 1, total: 42};
const orderId = getRunTypeId(order);

export {userId, orderId};
