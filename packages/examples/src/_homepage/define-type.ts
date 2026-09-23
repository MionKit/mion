import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

type User = {
  id: number;
  name: string;
  email: TF.Email;
  roles: ('admin' | 'user')[];
};

// a specialized validator, generated at build time
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', email: 'ada@example.com', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada'}); // false
