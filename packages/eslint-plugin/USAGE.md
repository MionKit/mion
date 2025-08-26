# ESLint Plugin Usage

This ESLint plugin provides rules for mion projects to ensure proper usage of run-types.

## Installation

The plugin is automatically available as a devDependency in the root package.json. When you clone the repository and run `npm install`, it will be available.

For manual installation in other projects:

```bash
npm install @mionkit/eslint-plugin --save-dev
```

## Configuration

### Recommended (Easy Setup)

Use the recommended configuration that includes all mionkit rules:

```javascript
module.exports = {
  extends: ['eslint:recommended', 'plugin:@mionkit/eslint-plugin/recommended'],
};
```

### Manual Configuration

Alternatively, configure individual rules manually:

```javascript
module.exports = {
  plugins: ['@mionkit/eslint-plugin'],
  rules: {
    '@mionkit/no-typeof-runtype': 'error',
  },
};
```

## Rules

### `no-typeof-runtype`

Disallows using `typeof` with the `runType` function from `@mionkit/run-types`.

#### ❌ Incorrect

```typescript
import {runType} from '@mionkit/run-types';

const user = {name: 'John', age: 34};
const rtUser = runType<typeof user>(); // Error: Do not use `typeof` with runType
```

#### ✅ Correct

```typescript
import {runType} from '@mionkit/run-types';

type User = {name: string; age: number};
const rtUser = runType<User>(); // OK: Use explicit type definitions
```

## Testing

To test the plugin on a specific file:

```bash
npx eslint --config .eslintrc.js path/to/file.ts
```

## Example Output

When violations are found:

```
/path/to/file.ts
  15:15  error  Do not use `typeof` with the `runType` function. Use explicit type definitions instead  @mionkit/no-typeof-runtype
  16:16  error  Do not use `typeof` with the `runType` function. Use explicit type definitions instead  @mionkit/no-typeof-runtype

✖ 2 problems (2 errors, 0 warnings)
```
