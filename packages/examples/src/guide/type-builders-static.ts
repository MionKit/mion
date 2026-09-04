import * as TF from '@mionjs/run-types/formats';
import {type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// Build a run-type as a value you can pass around, store, or compose.
const address = RT.object({
  street: TF.string(),
  city: TF.string(),
  zip: TF.string(),
});

// InferType<typeof runType> hands you the TypeScript type back.
type Address = InferType<typeof address>;

// Now `Address` is a normal type. Use it anywhere.
const home: Address = {
  street: '1 Infinite Loop',
  city: 'Cupertino',
  zip: '95014',
};

export {address, home};
export type {Address};
