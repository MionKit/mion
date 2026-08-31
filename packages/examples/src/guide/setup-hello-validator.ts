import {createValidateFn} from '@mionjs/run-types';

// A plain type, the only thing you write.
type User = {
  id: number;
  name: string;
};

// The build turns the type into this validator. No schema, no drift.
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada'}); // true
isUser({id: '1', name: 'Ada'}); // false, id is not a number

export {isUser};
