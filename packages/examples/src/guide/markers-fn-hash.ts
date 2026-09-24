import {getRunTypeId} from '@mionjs/run-types';
import {getFnHash} from '@mionjs/run-types/runtime';

// the default validator's function id; every getFnHash id is stable across releases
const validateId = getFnHash('validate');

// options that change the generated function change its id too
const typeofValidateId = getFnHash('validate', {numberMode: 'typeof'});

// each JSON encoder strategy is its own function
const encodeMutateId = getFnHash('jsonEncoder', {strategy: 'mutate'});

// the type id is the value getRunTypeId returns
type User = {id: number; name: string};
const userTypeId = getRunTypeId<User>();
const userValidatorKey = `${validateId}_${userTypeId}`;

export {validateId, typeofValidateId, encodeMutateId, userValidatorKey};
