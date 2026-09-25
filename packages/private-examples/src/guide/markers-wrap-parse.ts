import {createValidateFn, type ValidateFn} from '@mionjs/run-types';

// take the validator as an argument: createValidateFn<T>() in this generic body is MKR003
function parseChecked<T>(raw: string, isValid: ValidateFn<T>): T {
  const data: unknown = JSON.parse(raw);
  if (!isValid(data))
    throw new Error('payload does not match the expected type');
  return data as T;
}

type User = {id: number; name: string};

// User is concrete here, so the build can inject
const user = parseChecked('{"id":1,"name":"Ada"}', createValidateFn<User>());

export {parseChecked, user};
