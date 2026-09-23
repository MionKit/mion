import {createHasUnknownKeysFn, createValidateFn} from '@mionjs/run-types';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

const isUser = createValidateFn<User>();
// only for values that already passed isUser; any other input is undefined behavior
// all-required shapes, nested ones too, compare key counts: ~3x on small objects, ~13x at 30 props
const hasExtraFast = createHasUnknownKeysFn<User>(undefined, {
  runsAfterValidation: true,
});

export function isUserStrict(data: unknown): data is User {
  return isUser(data) && !hasExtraFast(data);
}

const address = {street: '10 Main', city: 'Springfield'};

isUserStrict({id: 1, name: 'Ada', address}); // true
isUserStrict({id: 1, name: 'Ada', address, admin: true}); // false, `admin` isn't in User
isUserStrict({id: 1, name: 'Ada', address: {...address, zip: '90210'}}); // false, nested extra key
