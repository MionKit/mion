import {createMockDataFn, type MockNodeHook} from '@mionjs/run-types/mocking';

type User = {
  name: string;
  age: number;
  tags: string[];
};

// start-hook
// the cursor is the field name; items and other steps turn the hook off
const hook: MockNodeHook<string> = {
  root: '',
  descend: (cursor, step) =>
    step.kind === 'property' ? String(step.name) : undefined,
  value: (cursor) => (cursor === 'name' ? {value: 'Ada'} : undefined),
  bounds: (cursor) => (cursor === 'age' ? {min: 18, max: 99} : undefined),
  length: (cursor) => (cursor === 'tags' ? 2 : undefined),
};

const mockUser = createMockDataFn<User>(undefined, {hook});
const user = mockUser(); // {name: 'Ada', age: 42, tags: ['xK', 'pq']}
// end-hook

export {mockUser, user};
