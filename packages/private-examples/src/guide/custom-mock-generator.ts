import type * as TF from '@mionjs/run-types/formats';
import {
  createMockDataFn,
  registerMockGenerator,
} from '@mionjs/run-types/mocking';

// start-custom-generator
// declare the name, so `generator: 'phoneNumberUk'` type checks
declare module '@mionjs/run-types/formats' {
  interface CustomMockGenerators {
    phoneNumberUk: true;
  }
}

// draw through `random` so a seeded mock repeats
registerMockGenerator(
  'phoneNumberUk',
  ({random}) => '+44 7' + random.string(9, '0123456789')
);

type Contact = {phone: TF.String<{maxLength: 16; generator: 'phoneNumberUk'}>};
const mockContact = createMockDataFn<Contact>();
mockContact(); // {phone: '+44 7912345678'}
// end-custom-generator

export {mockContact};
