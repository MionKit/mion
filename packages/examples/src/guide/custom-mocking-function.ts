import {registerMockingFunction, RunTypeKind, type FormatAnnotation} from '@ts-runtypes/core';

// Want mock data to look a certain way for a kind? Register a mock fn for
// that ReflectionKind. Return `undefined` to fall back to the default mock.
// Here: make every mocked string format spit out a friendlier value.
registerMockingFunction(RunTypeKind.string, (annotation: FormatAnnotation) => {
  if (annotation.name === 'email') return 'someone@example.com';
  return undefined; // defer to the built-in mock for everything else
});

// From now on createMockDataFn<T>() uses this when it mocks a string format.
// (createMockDataFn itself is covered in the Mocking guide.)
export {};
