import {
  createGetValidationErrorsFn,
  createUnknownKeyErrorsFn,
} from '@mionjs/run-types';

type User = {id: number; name: string};

const unknownKeyErrors = createUnknownKeyErrorsFn<User>();

unknownKeyErrors({id: 1, name: 'Ada'}); // []
unknownKeyErrors({id: 1, name: 'Ada', admin: true});
// [{path: ['admin'], expected: 'never'}]

// not a User, so no undeclared keys
unknownKeyErrors(null as unknown as User); // []
unknownKeyErrors('not a user' as unknown as User); // []

// Join it with the type errors for one strict report.
const typeErrors = createGetValidationErrorsFn<User>();
const strictErrors = (value: User) => [
  ...typeErrors(value),
  ...unknownKeyErrors(value),
];

export {unknownKeyErrors, strictErrors};
