# Jest to Vitest Migration Assessment

## Executive Summary

**Migration Complexity: LOW to MODERATE**

The mion monorepo is well-positioned for a Jest to Vitest migration due to:

- Already using Vite for builds with `@deepkit/vite` plugin
- Standard Jest patterns (no exotic features)
- Consistent test structure across packages
- No Jest-specific mocking that would require significant rewrites

## Current State Analysis

### Test Infrastructure

| Aspect            | Current State             | Migration Impact                                   |
| ----------------- | ------------------------- | -------------------------------------------------- |
| Test Runner       | Jest 29.6.2 with ts-jest  | Replace with Vitest                                |
| Type Compilation  | @deepkit/vite plugin      | **Already compatible** - reuse in vitest.config.ts |
| Test Pattern      | `*.spec.ts` files         | No change needed                                   |
| Module Resolution | `@mionkit/*` path aliases | Configure in Vitest                                |
| Coverage          | Jest built-in             | Vitest built-in (c8/v8)                            |

### Package-by-Package Analysis

```
packages/
├── run-types/      ~70+ spec files  - Core package, highest priority
├── type-formats/   ~15 spec files   - Format validation tests
├── router/         ~10 spec files   - Integration tests with server
├── client/         ~5 spec files    - Client tests with real server
├── codegen/        ~4 spec files    - AOT compilation tests
├── aws/            ~1 spec file     - Lambda integration
├── eslint-plugin/  ~5 spec files    - ESLint rule tests
├── test-publish/   ~2 spec files    - E2E tests
└── others          minimal tests
```

### Jest Features Currently Used

| Feature                | Usage                 | Vitest Equivalent              |
| ---------------------- | --------------------- | ------------------------------ |
| `describe()`           | Extensive             | Same API                       |
| `it()` / `test()`      | Extensive             | Same API                       |
| `expect()`             | Extensive             | Same API (compatible matchers) |
| `beforeAll/afterAll`   | Server setup/teardown | Same API                       |
| `beforeEach/afterEach` | Router reset          | Same API                       |
| `jest.fn()`            | Minimal               | `vi.fn()`                      |
| `jest.mock()`          | Not found             | `vi.mock()`                    |
| `jest.spyOn()`         | Not found             | `vi.spyOn()`                   |
| `jest.clearCache`      | In npm scripts        | `vitest --clearCache`          |

### Critical Integration: Deepkit Type Compiler

The project uses `@deepkit/vite` plugin for type reflection. This is **already Vite-compatible** and will work seamlessly with Vitest:

```typescript
// Current vite.config.ts (packages/run-types)
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
  plugins: [
    deepkitType({
      tsConfig: resolve(__dirname, 'tsconfig.json'),
      compilerOptions: {sourceMap: true},
    }),
    // ...
  ],
});
```

This same configuration can be used in `vitest.config.ts`.

## Benefits of Migration

### 1. Built-in Benchmarking (`vitest bench`)

```typescript
// Example: packages/run-types/src/benchmarks/validation.bench.ts
import {bench, describe} from 'vitest';
import {runType} from '../createRunType';
import {JitFunctions} from '../constants.functions';

describe('String Validation Performance', () => {
  const rt = runType<string>();
  const validate = rt.createJitFunction(JitFunctions.isType);

  bench('validate string', () => {
    validate('hello world');
  });

  bench('validate invalid', () => {
    validate(12345);
  });
});

describe('Complex Object Serialization', () => {
  interface User {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
  }

  const rt = runType<User>();
  const serialize = rt.createJitFunction(JitFunctions.prepareForJson);
  const user = {id: 1, name: 'John', email: 'john@example.com', createdAt: new Date()};

  bench('serialize user', () => {
    serialize(user);
  });
});
```

### 2. Better ESM Support

- Native ESM execution without transpilation overhead
- Better tree-shaking analysis
- Faster cold starts

### 3. Faster Test Execution

- Vite's on-demand compilation
- Smart test file watching
- Parallel execution improvements

### 4. Unified Tooling

- Same Vite config for builds and tests
- Consistent plugin ecosystem
- Shared caching

## Migration Complexity Assessment

### Low Complexity Items

1. **Test syntax** - Jest and Vitest share the same API for `describe`, `it`, `expect`, lifecycle hooks
2. **Configuration** - Can reuse existing Vite configs
3. **Path aliases** - Same resolution mechanism
4. **Coverage** - Built-in, similar configuration

### Moderate Complexity Items

1. **Global setup** - Need to configure `globalSetup` for server tests
2. **Timeout configuration** - Different syntax (`test.timeout` vs `jest.setTimeout`)
3. **Mock migration** - `jest.fn()` → `vi.fn()` (minimal usage found)

### Potential Challenges

1. **ts-jest removal** - Need to ensure deepkit plugin handles all type compilation
2. **Lerna integration** - Update `lerna run test` scripts
3. **CI/CD updates** - Update GitHub Actions workflows

## Recommended Migration Strategy

### Phase 1: Pilot Package (run-types)

Start with `run-types` as it has the most tests and will benefit most from benchmarking.

### Phase 2: Core Packages

Migrate `type-formats`, `router`, `core` packages.

### Phase 3: Integration Packages

Migrate `client`, `codegen`, `aws`, `http` packages.

### Phase 4: Cleanup

Remove Jest dependencies, update CI/CD, documentation.

## Benchmarking System Design

### Directory Structure

```
packages/run-types/
├── src/
│   ├── benchmarks/           # New benchmark files
│   │   ├── validation.bench.ts
│   │   ├── serialization.bench.ts
│   │   ├── json.bench.ts
│   │   └── binary.bench.ts
│   └── ... existing code
├── vitest.config.ts
└── package.json
```

### Benchmark Categories for run-types

1. **Validation Performance**
   - `isType` for primitives, objects, arrays, unions
   - `typeErrors` generation
2. **JSON Serialization**
   - `prepareForJson` (serialize)
   - `restoreFromJson` (deserialize)
   - `stringifyJson` (direct string output)
3. **Binary Serialization**
   - `toBinary` encoding
   - `fromBinary` decoding
4. **JIT Compilation**
   - Function generation time
   - Cache hit/miss scenarios

### Comparison Benchmarks (Separate Repo Recommended)

For comparing against other libraries (zod, io-ts, typebox, etc.), a separate repo is recommended:

- Avoids adding unnecessary dependencies to mion
- Cleaner benchmark isolation
- Easier to maintain and update
- Can be published as independent benchmark results

## Risk Assessment

| Risk                           | Likelihood | Impact | Mitigation                                     |
| ------------------------------ | ---------- | ------ | ---------------------------------------------- |
| Deepkit plugin incompatibility | Low        | High   | Test thoroughly in pilot phase                 |
| Test behavior differences      | Low        | Medium | Run both Jest and Vitest in parallel initially |
| CI/CD disruption               | Low        | Medium | Update workflows incrementally                 |
| Performance regression         | Very Low   | Low    | Vitest is generally faster                     |

## Conclusion

The migration from Jest to Vitest is **recommended** with **low to moderate complexity**. The main benefits are:

1. **Native benchmarking** - Critical for your performance testing goals
2. **Unified Vite ecosystem** - Already using Vite for builds
3. **Better ESM support** - Future-proofs the codebase
4. **Faster development** - Quicker test feedback loops

The deepkit type compiler integration via `@deepkit/vite` makes this migration particularly smooth since the same plugin works for both build and test configurations.

### Future OXC Consideration

When/if OXC supports TypeScript AST transforms (1+ year timeline), the migration path would be:

1. Replace `@deepkit/vite` with OXC-based Vite plugin
2. Update type reflection mechanism
3. Vitest configuration would remain largely unchanged

This makes Vitest a good long-term choice regardless of the type compiler backend.
