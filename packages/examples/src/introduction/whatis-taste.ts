import {createValidateFn} from '@ts-runtypes/core';

// Your TypeScript type. The single source of truth. Nothing else to write.
type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
};

// A validator generated from that type at build time. No schema, no drift.
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada'}); // false, id is not a number

export {isUser};
