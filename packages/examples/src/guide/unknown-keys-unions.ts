import {createHasUnknownKeysFn, createValidateFn} from '@ts-runtypes/core';

type Cat = {kind: 'cat'; meows: boolean};
type Dog = {kind: 'dog'; barks: number};
type Pet = Cat | Dog;

const isPetStrict = createValidateFn<Pet>(undefined, {checkUnknowns: true});

// Each branch is closed over its own properties, so the answer follows the
// branch the value matched.
isPetStrict({kind: 'cat', meows: true}); // true
isPetStrict({kind: 'dog', barks: 3}); // true
isPetStrict({kind: 'cat', meows: true, collar: 'red'}); // false, collar is in no branch
isPetStrict({kind: 'cat', meows: true, barks: 3}); // false, barks belongs to Dog

// The separate predicate never validates, so it cannot tell which branch
// matched. It pools every branch's property names into one list, which makes it
// more forgiving on a union.
const hasUnknown = createHasUnknownKeysFn<Pet>();

hasUnknown({kind: 'cat', meows: true, barks: 3}); // false, barks is in the pooled list
hasUnknown({kind: 'cat', meows: true, collar: 'red'}); // true

export {isPetStrict, hasUnknown};
