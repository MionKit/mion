import {
  createParseFn,
  isSerializationError,
  RTParseError,
} from '@mionjs/run-types';

type User = {id: number; name: string; joinedAt: Date};

// start-parse
const parseUser = createParseFn<User>();

const body = JSON.parse(
  '{"id":1,"name":"Ada","joinedAt":"2026-01-01T00:00:00.000Z"}'
);
const user = parseUser(body); // a checked User, joinedAt is a Date
// body.joinedAt is a Date too: parse restores the value in place
// end-parse

// start-parse-strategy
const parseCleanUser = createParseFn<User>(undefined, {strategy: 'strip'});
const parseStrictUser = createParseFn<User>(undefined, {strategy: 'fail'});

const withExtra = {
  id: 1,
  name: 'Ada',
  joinedAt: '2026-01-01T00:00:00.000Z',
  isAdmin: true,
};
const clean = parseCleanUser(structuredClone(withExtra)); // isAdmin is undefined
// parseStrictUser(withExtra) throws RTParseError
// end-parse-strategy

// start-parse-errors
try {
  parseUser({id: 'x', name: 'Ada', joinedAt: '2026-01-01T00:00:00.000Z'});
} catch (err) {
  if (!(err instanceof RTParseError)) throw err;
  if (isSerializationError(err.issues))
    console.log(err.issues.deserializeError); // restoring threw
  else console.log(err.issues); // [{path: ['id'], expected: 'number'}]
}
// end-parse-errors

export {user, clean, parseStrictUser};
