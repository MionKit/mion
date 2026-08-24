import {getFnHash, getRunTypeId} from '@ts-runtypes/core';

// Every generated function is stored under a key with two parts: a short id for
// the FUNCTION (which family it belongs to, plus any compile-time options) and
// the id for the TYPE it works on, joined as `functionId_typeId`. A framework
// that already holds a type's id can rebuild that key itself with getFnHash. The
// ids getFnHash returns are stable across releases.

// The function id for the default validator.
const validateId = getFnHash('val');

// Options that change the generated function change its id too, and getFnHash
// follows them: a validator that skips literal checks is a different function.
const looseValidateId = getFnHash('val', {noLiterals: true});

// The JSON encoder has several strategies, and each one is its own function.
const encodeMutateId = getFnHash('jsonEncoder', {strategy: 'mutate'});

// Join the function id with a type id to get the full storage key. The type id
// is the same value getRunTypeId returns for that type.
type User = {id: number; name: string};
const userTypeId = getRunTypeId<User>();
const userValidatorKey = `${validateId}_${userTypeId}`;

export {validateId, looseValidateId, encodeMutateId, userValidatorKey};
