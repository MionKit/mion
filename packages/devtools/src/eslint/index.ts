/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ESLint, Linter} from 'eslint';
import strongTypedRoutes from './rules/strong-typed-routes.ts';
import noUnreachableUnionTypes from './rules/no-unreachable-union-types.ts';
import noMixedUnionProperties from './rules/no-mixed-union-properties.ts';
import noViteClient from './rules/no-vite-client.ts';
import enforceTypeImports from './rules/enforce-type-imports.ts';

// NOTE: mion has no type-import rule of its own either. `no-type-imports` existed because deepkit
// emitted reflection metadata from the import statement, so `import type` erased it and silently
// broke validation. @ts-runtypes resolves types at BUILD TIME from the TypeScript program and
// injects at the route() call site, so an erased import changes nothing — guarded by
// packages/router/src/typeOnlyImports.spec.ts.
//
// NOTE: mion has no pure-function purity rule of its own. It used to, and it was a hand-written
// reimplementation of @ts-runtypes' checker — its 8 message ids mapped 1:1 onto PFE9006-9011
// (this/await/yield/dynamic-import/forbidden-global/closure) and PFN001-002. `runtypes/pure-functions`
// from @ts-runtypes/devtools/eslint routes the real diagnostics and is already enabled through
// tsRuntypesESLint.configs.recommended, so the mion copy was double-reporting on every serverMapFrom.

// configs is set outside the initial object due to circular reference: recommended config references the plugin itself.
const plugin: ESLint.Plugin = {
  rules: {
    'strong-typed-routes': strongTypedRoutes,
    'no-unreachable-union-types': noUnreachableUnionTypes,
    'no-mixed-union-properties': noMixedUnionProperties,
    'no-vite-client': noViteClient,
    'enforce-type-imports': enforceTypeImports,
  } as unknown as ESLint.Plugin['rules'],
  configs: {},
};

// Flat config preset: self-contained with plugin registration and recommended rules.
// Usage: import mionESLintPlugin from '@mionjs/devtools/eslint'; ... mionESLintPlugin.configs.recommended
plugin.configs!.recommended = {
  plugins: {
    '@mionjs': plugin,
  },
  rules: {
    '@mionjs/strong-typed-routes': 'error',
    '@mionjs/no-unreachable-union-types': 'error',
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionjs/no-mixed-union-properties': 'warn',
  },
} satisfies Linter.Config;

export default plugin;
