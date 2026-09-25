import * as TF from '@mionjs/run-types/formats';
import {type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

const address = RT.object({
  street: TF.string(),
  city: TF.string(),
  zip: TF.string(),
});

type Address = InferType<typeof address>;

// a normal type, use it anywhere
const home: Address = {
  street: '1 Infinite Loop',
  city: 'Cupertino',
  zip: '95014',
};

export {address, home};
export type {Address};
