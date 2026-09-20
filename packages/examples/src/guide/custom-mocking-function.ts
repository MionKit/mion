import {RunTypeKind, type FormatAnnotation} from '@mionjs/run-types';
import {registerMockingFunction} from '@mionjs/run-types/mocking';

// from now on createMockDataFn uses this for every mocked string format
registerMockingFunction(RunTypeKind.string, (annotation: FormatAnnotation) => {
  if (annotation.name === 'email') return 'someone@example.com'; // friendlier than a random string
  return undefined; // defer to the built-in mock for everything else
});

export {};
