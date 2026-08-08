import type * as TF from '@ts-runtypes/core/formats';
import {createValidateFn} from '@ts-runtypes/core';

// Your TypeScript type is the single source of truth. Nothing else to write.
type User = {
  id: number;
  name: string;
  email: TF.Email;
  roles: ('admin' | 'user')[];
};

// A specialized validator, generated from the type at build time.
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', email: 'ada@example.com', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada'}); // false
