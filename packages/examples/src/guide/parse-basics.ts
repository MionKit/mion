import {
  createParseFn,
  isSerializationError,
  RTParseError,
} from '@mionjs/run-types';

type Address = {street: string; city: string};
type User = {id: number; name: string; signedUp: Date; address: Address};

// takes the output of JSON.parse, not the string
const parseUser = createParseFn<User>();

const user = parseUser(
  JSON.parse(
    '{"id":1,"name":"Ada","signedUp":"2020-01-02T00:00:00.000Z","address":{"street":"Main","city":"Rome"}}'
  )
);
user.signedUp.getFullYear(); // a real Date

// drop undeclared properties
const parseUserStripped = createParseFn<User>(undefined, {strategy: 'strip'});
parseUserStripped(
  JSON.parse(
    '{"id":1,"name":"Ada","signedUp":"2020-01-02T00:00:00.000Z","address":{"street":"M","city":"R","zip":"1"}}'
  )
);
// the stripped address has no `zip`

// a failed check gives the same issues createGetValidationErrorsFn returns
// a value that could not be deserialized gives the reason instead
function readUser(body: string): User | string {
  try {
    return parseUser(JSON.parse(body));
  } catch (error) {
    if (!(error instanceof RTParseError)) throw error;
    const {issues} = error;
    if (isSerializationError(issues)) return issues.deserializeError;
    return issues.map((issue) => issue.path.join('.')).join(', ');
  }
}

readUser('{"id":"one"}'); // "id, name, signedUp, address"

// reject undeclared properties
const parseUserStrict = createParseFn<User>(undefined, {strategy: 'fail'});

export {parseUser, parseUserStripped, parseUserStrict, readUser, user};
