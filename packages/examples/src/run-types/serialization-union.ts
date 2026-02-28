import {createPrepareForJsonFn, createRestoreFromJsonFn} from '@mionkit/run-types';

type Result = string | number | {error: string};

const prepareForJson = await createPrepareForJsonFn<Result>();
const restoreFromJson = await createRestoreFromJsonFn<Result>();

// String value (index 0)
const json1 = prepareForJson('hello');
// Returns: [0, 'hello']

// Number value (index 1)
const json2 = prepareForJson(42);
// Returns: [1, 42]

// Object value (index 2)
const json3 = prepareForJson({error: 'not found'});
// Returns: [2, {error: 'not found'}]

// Deserialization restores the correct type
const restored = restoreFromJson(json2);
// restored === 42
