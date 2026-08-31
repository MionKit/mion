import type * as TF from '@mionjs/run-types/formats';
import {createMockDataFn} from '@mionjs/run-types';

// Type formats don't just validate: mocks respect them too.
type Contact = {
  id: TF.UUIDv4;
  email: TF.Email;
  name: string;
};

// start-formats
const mockContact = createMockDataFn<Contact>();

const fake = mockContact();
// id is a real-looking UUID, email is a real-looking address,
// not just random strings. The mock is format-aware.
// {id: '3f2504e0-4f89-...', email: 'name@example.com', name: '...'}
// end-formats

export {mockContact, fake};
