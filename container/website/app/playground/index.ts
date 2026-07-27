// Headless engine: everything needed to resolve + execute a type's build
// functions in the browser, with no UI. Imported by the playground Vue
// components and by the Node test suite.
export {
  run,
  versions,
  mock,
  mockInvalid,
  generatedCache,
  transformedSource,
  factoryImport,
  factoryCall,
  getResolver,
  setResolver,
  OPERATIONS,
  operationByKey,
  ROOT_TYPE,
} from './engine.ts';
export {loadResolver} from './wasmLoader.ts';
export {setRuntypesPackageSources} from './packageSources.ts';
export type {PackageSourcesOverlay} from './packageSources.ts';
export type {
  RunResult,
  RunTypeNode,
  RunTypeTreeNode,
  Diagnostic,
  Operation,
  OperationKind,
  CacheModule,
  Mode,
  Resolver,
  ResolverOptions,
  ResolverVersions,
} from './engine.ts';
