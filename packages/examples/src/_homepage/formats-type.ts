import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// a format brands a string or number
type Account = {
  id: TF.UUIDv4;
  email: TF.Email;
  ip: TF.IPv4;
  logins: TF.PositiveInt;
};

const isAccount = createValidateFn<Account>();
isAccount({id: 'nope', email: 'ada@x.com', ip: '10.0.0.1', logins: 3}); // false, id isn't a uuid
