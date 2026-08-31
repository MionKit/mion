import {createParseFn, RTParseError} from '@ts-runtypes/core';

type Address = {street: string; city: string};
type User = {id: number; name: string; signedUp: Date; address: Address};

// One function that restores the JSON shape into real values (a Date here, not
// a string) and checks it at the same time. It takes the output of JSON.parse,
// so it slots in wherever the body was already read.
const parseUser = createParseFn<User>();

const user = parseUser(
  JSON.parse('{"id":1,"name":"Ada","signedUp":"2020-01-02T00:00:00.000Z","address":{"street":"Main","city":"Rome"}}')
);
user.signedUp.getFullYear(); // a real Date

// Undeclared properties are dropped by default, at every level.
parseUser(
  JSON.parse('{"id":1,"name":"Ada","signedUp":"2020-01-02T00:00:00.000Z","address":{"street":"M","city":"R","zip":"1"}}')
);
// the parsed address has no `zip`

// On a mismatch it throws RTParseError, whose `issues` are the same entries
// createGetValidationErrorsFn reports, so an existing error renderer just works.
function readUser(body: string): User | string {
  try {
    return parseUser(JSON.parse(body));
  } catch (error) {
    if (error instanceof RTParseError) return error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw error;
  }
}

readUser('{"id":"one"}'); // "id, name, signedUp, address"

// Reject unexpected properties instead of dropping them.
const parseUserStrict = createParseFn<User>(undefined, {strategy: 'fail'});

export {parseUser, parseUserStrict, readUser, user};
