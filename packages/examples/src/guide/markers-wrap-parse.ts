import {createValidateFn, type ValidateFn} from '@ts-runtypes/core';

// A realistic wrapper: parse JSON and validate it against your type in one call.
// A createX<T>() factory needs a CONCRETE type at its OWN call site, so build
// the validator where the type is known and pass it in. Calling
// `createValidateFn<T>()` inside this generic body would use the wrapper's free
// `T` (unknown at build time), which the build reports as MKR003.
function parseChecked<T>(raw: string, isValid: ValidateFn<T>): T {
  const data: unknown = JSON.parse(raw);
  if (!isValid(data)) throw new Error('payload does not match the expected type');
  return data as T;
}

type User = {id: number; name: string};

// createValidateFn<User>() runs at a concrete call site: the build injects here.
const user = parseChecked('{"id":1,"name":"Ada"}', createValidateFn<User>());

export {parseChecked, user};
