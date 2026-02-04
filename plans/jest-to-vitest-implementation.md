# Jest to Vitest Migration - Implementation Plan

## Phase 1: Pilot Migration (run-types package)

### Step 1.1: Install Vitest Dependencies

Add to root `package.json` devDependencies:

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  }
}
```

### Step 1.2: Create Vitest Config for run-types

Create `packages/run-types/vitest.config.ts`:

```typescript
import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
  plugins: [
    deepkitType({
      tsConfig: resolve(__dirname, 'tsconfig.json'),
      compilerOptions: {
        sourceMap: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/xyz-Template/**', '**/serialization-suite.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/xyz-Template/**'],
    },
    alias: {
      '@mionkit/core': resolve(__dirname, '../core'),
      '@mionkit/run-types': resolve(__dirname, '.'),
    },
  },
  resolve: {
    alias: {
      '@mionkit/core': resolve(__dirname, '../core'),
    },
  },
});
```

### Step 1.3: Update package.json Scripts

Update `packages/run-types/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "bench": "vitest bench",
    "bench:run": "vitest bench --run"
  }
}
```

### Step 1.4: Create Initial Benchmark Files

Create `packages/run-types/src/benchmarks/validation.bench.ts`:

```typescript
import {bench, describe} from 'vitest';
import {runType} from '../createRunType';
import {JitFunctions} from '../constants.functions';

// Primitive validation benchmarks
describe('Primitive Validation', () => {
  describe('string', () => {
    const rt = runType<string>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

    bench('isType - valid', () => {
      isType('hello world');
    });

    bench('isType - invalid', () => {
      isType(12345);
    });

    bench('typeErrors - valid', () => {
      typeErrors('hello world');
    });

    bench('typeErrors - invalid', () => {
      typeErrors(12345);
    });
  });

  describe('number', () => {
    const rt = runType<number>();
    const isType = rt.createJitFunction(JitFunctions.isType);

    bench('isType - valid', () => {
      isType(42);
    });

    bench('isType - invalid', () => {
      isType('not a number');
    });
  });

  describe('boolean', () => {
    const rt = runType<boolean>();
    const isType = rt.createJitFunction(JitFunctions.isType);

    bench('isType - valid', () => {
      isType(true);
    });

    bench('isType - invalid', () => {
      isType('true');
    });
  });
});

// Object validation benchmarks
describe('Object Validation', () => {
  interface SimpleUser {
    id: number;
    name: string;
    email: string;
  }

  interface ComplexUser {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    roles: string[];
    metadata: {
      createdAt: Date;
      updatedAt: Date;
      tags: string[];
    };
  }

  describe('simple object', () => {
    const rt = runType<SimpleUser>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    const validUser = {id: 1, name: 'John', email: 'john@example.com'};
    const invalidUser = {id: '1', name: 'John', email: 'john@example.com'};

    bench('isType - valid', () => {
      isType(validUser);
    });

    bench('isType - invalid', () => {
      isType(invalidUser);
    });
  });

  describe('complex object', () => {
    const rt = runType<ComplexUser>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    const validUser = {
      id: 1,
      name: 'John',
      email: 'john@example.com',
      age: 30,
      isActive: true,
      roles: ['admin', 'user'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: ['vip', 'premium'],
      },
    };

    bench('isType - valid', () => {
      isType(validUser);
    });
  });
});

// Array validation benchmarks
describe('Array Validation', () => {
  describe('string array', () => {
    const rt = runType<string[]>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    const smallArray = ['a', 'b', 'c'];
    const largeArray = Array.from({length: 100}, (_, i) => `item-${i}`);

    bench('isType - small array (3 items)', () => {
      isType(smallArray);
    });

    bench('isType - large array (100 items)', () => {
      isType(largeArray);
    });
  });
});

// Union validation benchmarks
describe('Union Validation', () => {
  type StringOrNumber = string | number;
  type Status = 'pending' | 'active' | 'completed' | 'cancelled';

  describe('simple union', () => {
    const rt = runType<StringOrNumber>();
    const isType = rt.createJitFunction(JitFunctions.isType);

    bench('isType - first type', () => {
      isType('hello');
    });

    bench('isType - second type', () => {
      isType(42);
    });

    bench('isType - invalid', () => {
      isType(true);
    });
  });

  describe('literal union', () => {
    const rt = runType<Status>();
    const isType = rt.createJitFunction(JitFunctions.isType);

    bench('isType - first literal', () => {
      isType('pending');
    });

    bench('isType - last literal', () => {
      isType('cancelled');
    });

    bench('isType - invalid', () => {
      isType('unknown');
    });
  });
});
```

Create `packages/run-types/src/benchmarks/serialization.bench.ts`:

```typescript
import {bench, describe} from 'vitest';
import {runType} from '../createRunType';
import {JitFunctions} from '../constants.functions';

// JSON Serialization benchmarks
describe('JSON Serialization', () => {
  interface User {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
    roles: string[];
  }

  const rt = runType<User>();
  const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
  const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
  const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);

  const user: User = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date('2024-01-15T10:30:00Z'),
    roles: ['admin', 'user'],
  };

  const jsonString = JSON.stringify(prepareForJson(user));
  const parsedJson = JSON.parse(jsonString);

  describe('serialize', () => {
    bench('prepareForJson', () => {
      prepareForJson(user);
    });

    bench('stringifyJson (direct)', () => {
      stringifyJson(user);
    });

    bench('JSON.stringify (native)', () => {
      JSON.stringify(user);
    });

    bench('prepareForJson + JSON.stringify', () => {
      JSON.stringify(prepareForJson(user));
    });
  });

  describe('deserialize', () => {
    bench('restoreFromJson', () => {
      restoreFromJson(parsedJson);
    });

    bench('JSON.parse (native)', () => {
      JSON.parse(jsonString);
    });

    bench('JSON.parse + restoreFromJson', () => {
      restoreFromJson(JSON.parse(jsonString));
    });
  });
});

// Complex nested object serialization
describe('Complex Object Serialization', () => {
  interface Order {
    id: string;
    customer: {
      id: number;
      name: string;
      email: string;
    };
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    createdAt: Date;
    updatedAt: Date;
    status: 'pending' | 'processing' | 'shipped' | 'delivered';
  }

  const rt = runType<Order>();
  const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
  const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);

  const order: Order = {
    id: 'order-123',
    customer: {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
    },
    items: [
      {productId: 'prod-1', name: 'Widget', quantity: 2, price: 29.99},
      {productId: 'prod-2', name: 'Gadget', quantity: 1, price: 49.99},
      {productId: 'prod-3', name: 'Gizmo', quantity: 3, price: 19.99},
    ],
    total: 169.94,
    createdAt: new Date('2024-01-15T10:30:00Z'),
    updatedAt: new Date('2024-01-15T14:45:00Z'),
    status: 'processing',
  };

  bench('prepareForJson - complex', () => {
    prepareForJson(order);
  });

  bench('stringifyJson - complex', () => {
    stringifyJson(order);
  });

  bench('JSON.stringify - complex (native)', () => {
    JSON.stringify(order);
  });
});

// Date handling benchmarks
describe('Date Serialization', () => {
  const rt = runType<Date>();
  const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
  const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);

  const date = new Date('2024-01-15T10:30:00Z');
  const dateString = date.toISOString();

  bench('prepareForJson - Date', () => {
    prepareForJson(date);
  });

  bench('restoreFromJson - Date', () => {
    restoreFromJson(dateString);
  });

  bench('Date.toISOString (native)', () => {
    date.toISOString();
  });

  bench('new Date (native)', () => {
    new Date(dateString);
  });
});
```

### Step 1.5: Verify Tests Pass

Run tests to ensure everything works:

```bash
cd packages/run-types
npm run test
```

Run benchmarks:

```bash
npm run bench
```

---

## Phase 2: Migrate Core Packages

### Packages to migrate in order:

1. `core` - Shared utilities
2. `type-formats` - Format validation
3. `router` - HTTP routing
4. `http` - HTTP server

### Step 2.1: Create Shared Vitest Config

Create `vitest.workspace.ts` at root:

```typescript
import {defineWorkspace} from 'vitest/config';

export default defineWorkspace([
  'packages/run-types/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/type-formats/vitest.config.ts',
  'packages/router/vitest.config.ts',
  'packages/node/vitest.config.ts',
  'packages/client/vitest.config.ts',
  'packages/codegen/vitest.config.ts',
  'packages/aws/vitest.config.ts',
  'packages/bun/vitest.config.ts',
  'packages/gcloud/vitest.config.ts',
  'packages/eslint-plugin/vitest.config.ts',
]);
```

### Step 2.2: Template vitest.config.ts for packages

Each package gets a similar config:

```typescript
import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
  plugins: [
    deepkitType({
      tsConfig: resolve(__dirname, 'tsconfig.json'),
      compilerOptions: {sourceMap: true},
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    alias: {
      '@mionkit/core': resolve(__dirname, '../core'),
      '@mionkit/run-types': resolve(__dirname, '../run-types'),
      '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
      '@mionkit/router': resolve(__dirname, '../router'),
    },
  },
});
```

---

## Phase 3: Migrate Integration Packages

### Packages:

- `client` - Has server integration tests
- `codegen` - AOT compilation tests
- `aws`, `bun`, `gcloud` - Platform adapters
- `test-publish` - E2E tests

### Special Considerations:

#### Server Setup for Integration Tests

Create `packages/test-server/vitest.setup.ts`:

```typescript
import {beforeAll, afterAll} from 'vitest';
import {startTestServer, stopTestServer} from './src/testServer';

beforeAll(async () => {
  await startTestServer();
}, 30000);

afterAll(async () => {
  await stopTestServer();
}, 10000);
```

---

## Phase 4: Cleanup and Finalization

### Step 4.1: Remove Jest Dependencies

Remove from root `package.json`:

```json
{
  "devDependencies": {
    // Remove these:
    "@types/jest": "^29.5.3",
    "jest": "^29.6.2",
    "ts-jest": "^29.4.6",
    "eslint-plugin-jest": "^29.0.1"
  }
}
```

### Step 4.2: Update Root Scripts

Update root `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "bench": "vitest bench",
    "bench:run": "vitest bench --run",
    "clean": "lerna run clean && nx reset"
  }
}
```

### Step 4.3: Delete Jest Config Files

Remove from each package:

- `jest.config.js`

### Step 4.4: Update CI/CD

Update `.github/workflows/test.yml` (or similar):

```yaml
- name: Run tests
  run: npm run test

- name: Run benchmarks
  run: npm run bench:run
```

### Step 4.5: Update Documentation

Update `AGENTS.md` testing section:

```markdown
## Testing

- Uses Vitest as testing framework
- Test files use `.spec.ts` suffix
- Benchmark files use `.bench.ts` suffix
- Run tests on single file: `npx vitest <file-pattern>`
- Run all tests in package: `npm run test`
- Run benchmarks: `npm run bench`
```

---

## Migration Checklist

### Per-Package Checklist:

- [ ] Create `vitest.config.ts`
- [ ] Update `package.json` scripts
- [ ] Run tests and verify all pass
- [ ] Delete `jest.config.js`
- [ ] Add benchmark files (if applicable)

### Global Checklist:

- [ ] Create `vitest.workspace.ts`
- [ ] Update root `package.json`
- [ ] Remove Jest dependencies
- [ ] Update CI/CD workflows
- [ ] Update documentation
- [ ] Run full test suite
- [ ] Run full benchmark suite

---

## Rollback Plan

If issues arise during migration:

1. Keep Jest configs until all packages are migrated
2. Run both test runners in parallel during transition
3. Git tags for each phase completion
4. Revert to Jest if critical issues found

---

## Success Criteria

1. All existing tests pass with Vitest
2. Test execution time is equal or faster
3. Benchmarks run successfully
4. CI/CD pipeline works
5. No regressions in type reflection
