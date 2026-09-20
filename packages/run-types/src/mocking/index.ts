// `@mionjs/run-types/mocking` entry, off the main one: a client that only validates never carries it.

export {createMockDataFn} from './createMockData.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mockTypes.ts';
// A custom fn registered here receives this random source, so it stays reproducible under a seed.
export {MockRandom} from './mockRandom.ts';
export {registerMockingFunction, type MockFormatFn} from './mockRegistry.ts';
