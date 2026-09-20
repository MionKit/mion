// Public entry for the `@mionjs/run-types/mocking` subpath. Mock generation is a
// development feature, so it lives off the main entry: a browser client that only
// validates never reaches this module graph and never carries it.

export {createMockDataFn} from './createMockData.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mockTypes.ts';
// A custom fn registered here receives this random source, so it stays reproducible under a seed.
export {MockRandom} from './mockRandom.ts';
export {registerMockingFunction, type MockFormatFn} from './mockRegistry.ts';
