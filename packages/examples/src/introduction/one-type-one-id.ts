import {getRunTypeId} from '@ts-runtypes/core';

// Two interfaces, different names, but the exact same shape.
interface User {
  id: number;
  name: string;
}

interface Account {
  id: number;
  name: string;
}

// Same structure resolves to the same structural id: one shared cache entry.
console.log(getRunTypeId<User>() === getRunTypeId<Account>()); // true
