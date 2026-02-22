# Plan: Refactor Pure Function Injection to AST-Based Transformer

## Context

The current `transformPureFnCalls` function uses a hybrid approach: AST extraction + **string-based injection** (regex matching, `findMatchingParen` with manual string skipping for quotes, comments, regex literals). This is fragile — we just fixed a bug where a regex literal `/\(/` containing an unbalanced paren broke the injection for `cpf_sanitizeCompiledFn`.

The goal is to replace string manipulation with a **TypeScript custom transformer** that runs inside `ts.transpileModule` alongside deepkit. The transformer uses the visitor pattern to find call nodes and inject extra arguments via `ts.factory.updateCallExpression` — pure AST, no string hacking.

## Architecture Overview

```
BEFORE (3 separate steps):
  Step 1: transformPureFnCalls(code, 'pureServerFn', 'hash')      → string injection
  Step 2: transformPureFnCalls(code, 'registerPureFnFactory', ...) → string injection
  Step 3: deepkitTransform(code, fileName)                         → ts.transpileModule

AFTER (single ts.transpileModule call):
  ts.transpileModule(code, {
    transformers: {
      before: [pureFnTransformer, deepkitTransformer],  // ours first, then deepkit
      after:  [deepkitDeclarationTransformer],
    }
  })
```

All pure function injection + deepkit type reflection happen in one parse → transform → emit cycle.

## Files to Modify

### 1. NEW: `packages/devtools/src/vite-plugin/pureFnTransformer.ts`

Creates a TypeScript `CustomTransformerFactory` that:
- **Pre-extracts** data using existing `extractPureFnsFromSource` (ensures hash consistency — same whole-file esbuild strip + JS AST path)
- Visits all `CallExpression` nodes in the AST
- When it finds `pureServerFn(def)`: injects bodyHash as 2nd arg (skips if already has 2 args)
- When it finds `registerPureFnFactory(ns, id, fn)`: injects ParsedFactoryFn as 4th arg (skips if already has 4 args)
- Collects `ExtractedPureFn[]` as a side effect (optional output param)

```typescript
import * as ts from 'typescript';
import {extractPureFnsFromSource} from './extractPureFn.ts';
import {ExtractedPureFn} from './types.ts';

export function createPureFnTransformerFactory(
    originalSource: string,
    filePath: string,
    collector?: ExtractedPureFn[]
): ts.CustomTransformerFactory {
    // Pre-extract using proven whole-file-strip + JS AST approach (hash consistency)
    const hasPureServerFn = originalSource.includes('pureServerFn');
    const hasFactory = originalSource.includes('registerPureFnFactory');

    const pureServerFns = hasPureServerFn
        ? extractPureFnsFromSource(originalSource, filePath, 'pureServerFn') : [];
    const factoryFns = hasFactory
        ? extractPureFnsFromSource(originalSource, filePath, 'registerPureFnFactory') : [];

    return (context: ts.TransformationContext): ts.CustomTransformer => {
        let pureIdx = 0;
        let factoryIdx = 0;

        function visitor(node: ts.Node): ts.Node {
            if (ts.isCallExpression(node)) {
                const callee = node.expression;
                if (ts.isIdentifier(callee)) {
                    if (callee.text === 'pureServerFn' && pureIdx < pureServerFns.length) {
                        if (node.arguments.length >= 2) { pureIdx++; return ts.visitEachChild(node, visitor, context); }
                        const data = pureServerFns[pureIdx++];
                        collector?.push(data);
                        return context.factory.updateCallExpression(
                            node, node.expression, node.typeArguments,
                            [...node.arguments, context.factory.createStringLiteral(data.bodyHash)]
                        );
                    }
                    if (callee.text === 'registerPureFnFactory' && factoryIdx < factoryFns.length) {
                        if (node.arguments.length >= 4) { factoryIdx++; return ts.visitEachChild(node, visitor, context); }
                        const data = factoryFns[factoryIdx++];
                        collector?.push(data);
                        return context.factory.updateCallExpression(
                            node, node.expression, node.typeArguments,
                            [...node.arguments, createParsedFactoryFnNode(context.factory, data)]
                        );
                    }
                }
            }
            return ts.visitEachChild(node, visitor, context);
        }

        return {
            transformSourceFile(sourceFile: ts.SourceFile): ts.SourceFile {
                if (pureServerFns.length === 0 && factoryFns.length === 0) return sourceFile;
                return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
            },
            transformBundle(bundle: ts.Bundle): ts.Bundle { return bundle; },
        };
    };
}

/** Creates an AST node for {bodyHash: '...', paramNames: [...], code: '...'} */
function createParsedFactoryFnNode(factory: ts.NodeFactory, data: ExtractedPureFn): ts.ObjectLiteralExpression {
    return factory.createObjectLiteralExpression([
        factory.createPropertyAssignment('bodyHash', factory.createStringLiteral(data.bodyHash)),
        factory.createPropertyAssignment('paramNames', factory.createArrayLiteralExpression(
            data.paramNames.map(n => factory.createStringLiteral(n))
        )),
        factory.createPropertyAssignment('code', factory.createStringLiteral(data.fnBody)),
    ]);
}
```

### 2. MODIFY: `packages/devtools/src/vite-plugin/deepkit-type.ts`

Refactor to export config components separately (for integration into unified pipeline):

```typescript
export interface DeepkitConfig {
    filter: (fileName: string) => boolean;
    compilerOptions: ts.CompilerOptions;
    beforeTransformers: ts.CustomTransformerFactory[];
    afterTransformers: ts.CustomTransformerFactory[];
}

export function createDeepkitConfig(options: DeepkitTypeOptions): DeepkitConfig {
    const filter = createFilter(
        options.include ?? ['**/*.tsx', '**/*.ts'],
        options.exclude ?? 'node_modules/**'
    );
    return {
        filter: (fileName: string) => filter(fileName),
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            configFilePath: options.tsConfig || process.cwd() + '/tsconfig.json',
            ...(options.compilerOptions || {}),
        },
        beforeTransformers: [transformer],
        afterTransformers: [declarationTransformer],
    };
}

// Keep createDeepkitTransform as convenience (used by bun loader, tests)
export function createDeepkitTransform(options: DeepkitTypeOptions = {}) { ... }
```

### 3. MODIFY: `packages/devtools/src/vite-plugin/mionVitePlugin.ts`

Replace 3-step transform hook with single unified `ts.transpileModule` call:

```typescript
import {createPureFnTransformerFactory} from './pureFnTransformer.ts';
import {createDeepkitConfig, DeepkitConfig} from './deepkit-type.ts';

// In mionVitePlugin():
const deepkitConfig: DeepkitConfig | null = deepkitOptions ? createDeepkitConfig(deepkitOptions) : null;

// Default compiler options for when deepkit is disabled
const defaultCompilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
};

// transform hook:
transform(code: string, fileName: string) {
    const hasPureFns = code.includes('pureServerFn') || code.includes('registerPureFnFactory');
    const needsDeepkit = deepkitConfig ? deepkitConfig.filter(fileName) : false;

    if (!hasPureFns && !needsDeepkit) return null;

    const before: ts.CustomTransformerFactory[] = [];
    const after: ts.CustomTransformerFactory[] = [];

    // Pure function transformer (runs first — sees clean AST)
    if (hasPureFns) {
        before.push(createPureFnTransformerFactory(code, fileName));
    }

    // Deepkit transformers (run after ours)
    if (needsDeepkit) {
        before.push(...deepkitConfig!.beforeTransformers);
        after.push(...deepkitConfig!.afterTransformers);
    }

    const compilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;

    const result = ts.transpileModule(code, {
        compilerOptions,
        fileName,
        transformers: { before, after },
    });

    return { code: result.outputText, map: result.sourceMapText };
}
```

**Key changes:**
- Remove `import {scanClientSource, transformPureFnCalls}` — change to `import {scanClientSource}`
- Add `import {createPureFnTransformerFactory}` from new file
- Add `import * as ts from 'typescript'`
- Replace `createDeepkitTransform` with `createDeepkitConfig`
- When `hasPureFns` is false and `needsDeepkit` is true → only deepkit transformers run (same as before)
- When `hasPureFns` is true and `needsDeepkit` is false → only our transformer + `ts.transpileModule` emits JS

### 4. MODIFY: `packages/devtools/src/vite-plugin/extractPureFn.ts`

**Remove** (~210 lines of string manipulation code):
- `transformPureFnCalls` function
- `transformPureServerFnCalls` function
- `findMatchingParen` function
- `skipStringLiteral` function
- `skipTemplateLiteral` function
- `isRegexStart` function
- `skipRegexLiteral` function
- `InjectionMode` type export

**Keep** (all AST-based extraction, validation, scanning):
- `scanClientSource` — used by virtual module load hook
- `extractPureFnsFromSource` — used by transformer and scan
- `stripTypes` — used by extraction
- `extractDataFromPureFnDefAST` — pureServerFn extraction
- `extractDataFromRegisterPureFnFactoryAST` — factory extraction
- `extractPureFnDefFromObjectLiteral` — object literal parsing
- `resolveVariableInitializer` — variable reference resolution
- `validatePurity`, `validateFactoryPurity` — purity checking
- `getBodyText`, `collectLocalDeclarations`, `collectBindingNames` — helpers
- `PurityError` — error class

### 5. UPDATE: `packages/devtools/src/vite-plugin/extractPureFn.spec.ts`

**Remove** test blocks for deleted functions:
- `describe('transformPureFnCalls — pureServerFn')` — tests string-based injection
- `describe('transformPureFnCalls — registerPureFnFactory')` — tests string-based injection
- `describe('findMatchingParen')` — tests paren matching utility

**Add** new test file or section for the transformer:

`packages/devtools/src/vite-plugin/pureFnTransformer.spec.ts`:
- Creates transformer, applies via `ts.transform()`, verifies extra args in output AST
- Tests pureServerFn injection (bodyHash as 2nd string arg)
- Tests registerPureFnFactory injection (ParsedFactoryFn as 4th object arg)
- Tests idempotency (skips already-injected calls)
- Tests mixed file (both pureServerFn and registerPureFnFactory)
- Tests file with no target calls (no-op)
- Tests integration: `ts.transpileModule` with pureFnTransformer produces correct JS output

### 6. Rebuild devtools

After source changes: `npm run build -w @mionkit/devtools`

## Key Design Decisions

1. **Pre-extraction for hash consistency**: The transformer calls `extractPureFnsFromSource` upfront (same whole-file esbuild strip + JS AST path). This ensures bodyHash values are identical to what `scanClientSource` produces for the virtual module cache. No hash changes.

2. **Transformer order**: Our transformer runs BEFORE deepkit's (`before: [pureFn, deepkit]`). This ensures we see the clean TypeScript AST without deepkit's `__assignType` injections.

3. **Idempotency via argument count**: Instead of regex-checking inner content, the transformer checks `node.arguments.length` — if pureServerFn already has 2+ args or registerPureFnFactory has 4+ args, skip. Clean and reliable.

4. **Single `ts.transpileModule` call**: Replaces the current 3-step flow (string inject → string inject → deepkit). One parse, one emit, all transformers run on the same AST.

5. **When deepkit is disabled**: Files with pure function calls still go through `ts.transpileModule` (with just our transformer). This compiles TS→JS, which Vite accepts. Minor difference from before (where string injection returned modified TS), but functionally equivalent.

6. **`extractPureFnsFromSource` unchanged**: The extraction logic (esbuild strip → JS AST → validate → compute hash) is proven and well-tested. The transformer reuses it rather than reimplementing extraction on the TS AST.

## Verification

1. Run devtools tests: `npx vitest run --project devtools`
2. Rebuild devtools: `npm run build -w @mionkit/devtools`
3. Run core tests: `npx vitest run --project core`
4. Run run-types tests: `npx vitest run --project run-types` (critical — uses registerPureFnFactory)
5. Run all tests: `npm run test` (2076 tests must pass)
