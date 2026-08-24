import type * as TF from '@ts-runtypes/core/formats';
import {createValidateFn} from '@ts-runtypes/core';

// A format brands a string or number. The validator checks its exact
// shape, not just "is it a string".
type Account = {
  id: TF.UUIDv4;
  email: TF.Email;
  ip: TF.IPv4;
  logins: TF.PositiveInt;
};

const isAccount = createValidateFn<Account>();
isAccount({id: 'nope', email: 'ada@x.com', ip: '10.0.0.1', logins: 3}); // false, id isn't a uuid
