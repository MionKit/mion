// Next rejects a `"use client"` / `"use server"` that is not the first statement, and a `#!` only works on
// line 1, so the injected import block has to land below both. A real `vite build` over real files, in both
// transform modes: each file's rewrite is captured right after the plugin, so the exact placement is checked
// on what the bundler receives, and the two modes must agree byte for byte.
import {beforeAll, describe, expect, it} from 'vitest';
import {build, type Plugin} from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import runtypes from '../src/runtypes/vite.ts';
import {BIN, createMarkerProject, hasBinary} from './helpers/inline.ts';
import {decodeMappings} from './helpers/sourcemap.ts';

const IMPORT_MARKER = `import {getRunTypeId} from '@mionjs/run-types';`;

// Each file, then what the rewrite must start with: `IMPORTS` stands for the injected import block.
const CASES: Record<string, {source: string; head: string}> = {
  'use-client.tsx': {
    source: `"use client";\n\n${IMPORT_MARKER}\nconst h = (..._args: unknown[]) => null;\nexport const view = <i>{getRunTypeId<string>()}</i>;\n`,
    head: `"use client";\nIMPORTS\n\n${IMPORT_MARKER}\n`,
  },
  'use-server-strict.ts': {
    source: `'use server';\n"use strict";\n${IMPORT_MARKER}\nexport async function act() {\n  return getRunTypeId<string>();\n}\n`,
    head: `'use server';\n"use strict";\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  'no-semicolon.ts': {
    source: `"use client"\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `"use client"\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  'trailing-comments.ts': {
    source: `// header\n"use client"; /* why */ // client only\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `// header\n"use client"; /* why */ // client only\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  // Code shares the directive's line, so the block goes right after the `;`, on its own line.
  'same-line.ts': {
    source: `"use client"; ${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `"use client";\nIMPORTS\n ${IMPORT_MARKER}\n`,
  },
  'multiline-comment.ts': {
    source: `"use client" /* a\nb */\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `"use client"\nIMPORTS\n /* a\nb */\n`,
  },
  'shebang.ts': {
    source: `#!/usr/bin/env node\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `#!/usr/bin/env node\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  'shebang-strict.ts': {
    source: `#!/usr/bin/env node\n'use strict';\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `#!/usr/bin/env node\n'use strict';\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  // Multibyte text before the directive: the block offset is converted from bytes like every edit.
  'multibyte-header.ts': {
    source: `// 🦄 — note\n"use client";\n${IMPORT_MARKER}\nexport const id = getRunTypeId<string>();\n`,
    head: `// 🦄 — note\n"use client";\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  // The value marker shape (marker coverage rule); every other case uses the static one.
  'reflect-value.ts': {
    source: `"use client";\n${IMPORT_MARKER}\nconst sample = {id: 1};\nexport const id = getRunTypeId(sample);\n`,
    head: `"use client";\nIMPORTS\n${IMPORT_MARKER}\n`,
  },
  // A string that is not a whole statement is no directive: the block stays at the very top.
  'not-a-directive.ts': {
    source: `${IMPORT_MARKER}\n"use client".length;\nexport const id = getRunTypeId<string>();\n`,
    head: `IMPORTS\n${IMPORT_MARKER}\n`,
  },
};

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
    jsx: 'preserve',
  },
  include: ['**/*.ts', '**/*.tsx'],
  exclude: ['node_modules'],
});

type Rewrite = {code: string; mappings: string};

// Runs one real build and returns each case's code as the mion plugin handed it on.
async function buildAndCapture(mode: 'edits' | 'go'): Promise<Record<string, Rewrite>> {
  const dir = createMarkerProject(`rt-directive-${mode}-`);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  for (const [name, {source}] of Object.entries(CASES)) fs.writeFileSync(path.join(dir, name), source);
  const rewrites: Record<string, Rewrite> = {};
  // Same `enforce` and listed after mion, so it sees exactly what the rewrite produced.
  const capture: Plugin = {
    name: 'capture-rewrite',
    enforce: 'pre',
    transform(code, id) {
      const name = path.basename(id);
      if (name in CASES) rewrites[name] = {code, mappings: this.getCombinedSourcemap().mappings};
      return null;
    },
  };
  try {
    await build({
      root: dir,
      logLevel: 'silent',
      esbuild: {jsx: 'transform', jsxFactory: 'h'},
      plugins: [
        runtypes({
          binary: BIN,
          cwd: dir,
          tsconfig: 'tsconfig.json',
          transformMode: mode,
          genDir: path.join(dir, '.mion'),
        }) as never,
        capture,
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: Object.fromEntries(Object.keys(CASES).map((name) => [name, path.join(dir, name)])),
          external: [/^@mionjs\/run-types/],
          // Bundlers drop module-level directives with a warning; only the rewrite before them is under test.
          onwarn: () => {},
        },
      },
    });
    return rewrites;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// One build per mode, shared by the placement tests and the parity test.
const builds: Partial<Record<'edits' | 'go', Promise<Record<string, Rewrite>>>> = {};
const rewritesFor = (mode: 'edits' | 'go') => (builds[mode] ??= buildAndCapture(mode));

const IMPORT_BLOCK = /^import \{__rt_[A-Za-z0-9_$, ]+\} from '[^']+';$/m;
const CALL = /getRunTypeId(?:<string>)?\(/;
const withImportsMarked = (code: string) => code.replace(IMPORT_BLOCK, 'IMPORTS');

const register = hasBinary() ? it : it.skip;

describe.each(['edits', 'go'] as const)('the import block stays below the directive prologue [transformMode=%s]', (mode) => {
  let rewrites: Record<string, Rewrite>;
  beforeAll(async () => {
    if (hasBinary()) rewrites = await rewritesFor(mode);
  }, 180_000);

  for (const [name, {source, head}] of Object.entries(CASES)) {
    register(name, () => {
      const rewrite = rewrites[name];
      expect(rewrite, `${name} was not rewritten`).toBeDefined();
      expect(rewrite.code).toMatch(IMPORT_BLOCK);
      expect(withImportsMarked(rewrite.code).startsWith(head), rewrite.code).toBe(true);
      expect(rewrite.code).toMatch(/getRunTypeId(?:<string>)?\((?:undefined|sample), __rt_/);

      // The call still maps back to its original line, so the block displaced nothing in the debugger's view.
      const originalLine = source.split('\n').findIndex((line) => CALL.test(line));
      const generatedLine = rewrite.code.split('\n').findIndex((line) => CALL.test(line));
      const segments = decodeMappings(rewrite.mappings)[generatedLine] ?? [];
      expect(segments.map((segment) => segment.originalLine)).toContain(originalLine);
    });
  }
});

describe('the two transform modes place the block identically', () => {
  let edits: Record<string, Rewrite>;
  let go: Record<string, Rewrite>;
  beforeAll(async () => {
    if (hasBinary()) [edits, go] = await Promise.all([rewritesFor('edits'), rewritesFor('go')]);
  }, 180_000);

  register('edits mode reproduces go mode byte for byte on every case', () => {
    for (const name of Object.keys(CASES)) {
      expect(edits[name]?.code, name).toBe(go[name]?.code);
      expect(edits[name]?.mappings, name).toBe(go[name]?.mappings);
    }
  });
});
