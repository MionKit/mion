// THE OFFICIAL LIST of what `ts-runtypes convert` cannot rewrite.
//
// Every entry below is a real declaration handed to the REAL binary over a real
// temp project, asserting the exact diagnostic code and the message the user
// sees. The website's conversion guide links here rather than restating the
// list, so this file is the single source of truth: a refusal that is fixed
// must be deleted here (the test fails the moment it starts converting), and a
// new refusal has to be added here to be considered documented.
//
// The contract every entry shares, and what makes a refusal safe rather than
// lossy: the converter NEVER writes a declaration it cannot spell exactly. It
// reports the code, leaves that declaration byte-identical, converts everything
// else in the file, and exits non-zero.
//
// Not listed, deliberately: internal conditions a user cannot author around
// (a name the converter cannot derive, an unknown --to target).
import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary, writeMarkerPackage} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

const register = hasBinary() ? it : it.skip;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true
  },
  "include": ["src"]
}
`;

/** With `ESNext.Temporal` dropped from `lib` — the CNV007 case. */
const TSCONFIG_NO_TEMPORAL = TSCONFIG.replace('"target": "ES2022"', '"target": "ES2022", "lib": ["ES2022"]');

type Target = 'type' | 'builders' | 'json-schema';

interface UnsupportedCase {
  /** What a reader should understand the limitation to be. */
  readonly title: string;
  /** The declarations, as `src/<name>.ts`. `main.ts` is the converted file. */
  readonly files: Readonly<Record<string, string>>;
  readonly target: Target;
  readonly portable?: true;
  readonly noTemporalLib?: true;
  readonly code: string;
  /** A distinctive fragment of the message the user is shown. */
  readonly says: string;
  /** The declaration text that must survive untouched. */
  readonly keeps: string;
}

const MARKER = "import {getRunTypeId} from '@ts-runtypes/core';\n";

const UNSUPPORTED: readonly UnsupportedCase[] = [
  // ── No spelling exists for the shape ──────────────────────────────────
  {
    title: 'a generic declaration (an unbound type parameter has no runtime shape)',
    files: {'main.ts': 'export type Box<T> = {value: T};\n'},
    target: 'builders',
    code: 'CNV002',
    says: 'no spelling for an unbound type parameter',
    keeps: 'export type Box<T> = {value: T};',
  },
  {
    title: 'a cycle that never passes through a named type (name the inner type to fix it)',
    files: {'main.ts': "export type Outer = {inner: {back?: Outer['inner']}};\n"},
    target: 'builders',
    code: 'CNV001',
    says: 'cycle through an unnamed type',
    keeps: "export type Outer = {inner: {back?: Outer['inner']}};",
  },
  {
    title: 'named properties beside an index signature (an index-only object converts as a record)',
    files: {'main.ts': 'export type Mixed = {name: string; [key: string]: unknown};\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'mixed named properties + index signature',
    keeps: 'export type Mixed = {name: string; [key: string]: unknown};',
  },
  {
    title: 'a non-string index signature key',
    files: {'main.ts': 'export type Numeric = {[key: number]: string};\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'non-string or multiple index signatures',
    keeps: 'export type Numeric = {[key: number]: string};',
  },
  {
    title: 'a symbol-keyed member',
    files: {'main.ts': 'declare const tag: unique symbol;\nexport type Tagged = {[tag]: number};\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'symbol-keyed member',
    keeps: 'export type Tagged = {[tag]: number};',
  },

  // ── Recursion the value-first form cannot carry ───────────────────────
  {
    title: 'an exclusive union with a plain-value branch, reaching a cycle',
    files: {
      'main.ts':
        "import {type OneOf} from '@ts-runtypes/core/builders';\n" + 'export type Mixed = OneOf<[{next: Mixed}, number]>;\n',
    },
    target: 'builders',
    code: 'CNV001',
    says: 'primitive branch',
    keeps: 'export type Mixed = OneOf<[{next: Mixed}, number]>;',
  },
  {
    title: 'a recursive type reached only inside an embedded type expression',
    // A function signature has no JSON spelling, so the schema target embeds it
    // as quoted TypeScript — and quoted text cannot point back at the
    // declaration being defined.
    files: {'main.ts': 'export type Node = {run: (n: Node) => void};\n'},
    target: 'json-schema',
    code: 'CNV001',
    says: 'self-referential type inside an embedded type expression',
    keeps: 'export type Node = {run: (n: Node) => void};',
  },

  // ── Cross-file references the run cannot see ──────────────────────────
  {
    title: 'a reference to a type whose file is not part of the same run',
    files: {
      'leaf.ts': 'export type Leaf = {value: string};\n',
      'main.ts': "import {type Leaf} from './leaf.ts';\nexport type Branch = {leaf: Leaf};\n",
    },
    target: 'builders',
    code: 'CNV004',
    says: 'not part of this conversion run',
    keeps: 'export type Branch = {leaf: Leaf};',
  },

  // ── Standard JSON Schema cannot say it (--portable only) ──────────────
  {
    title: 'a bigint under --portable (the RunTypes dialect is forbidden there)',
    files: {'main.ts': 'export type Big = bigint;\n'},
    target: 'json-schema',
    portable: true,
    code: 'CNV006',
    says: 'drop --portable',
    keeps: 'export type Big = bigint;',
  },
  {
    title: 'labeled tuple slots under --portable (2020-12 has no label spelling)',
    files: {'main.ts': 'export type Point = [x: number, y: number];\n'},
    target: 'json-schema',
    portable: true,
    code: 'CNV006',
    says: 'jsLabels',
    keeps: 'export type Point = [x: number, y: number];',
  },

  // ── The library is missing, so the type is already lost ───────────────
  {
    title: 'a Temporal type resolving to any because the Temporal lib is not loaded',
    files: {'main.ts': 'export type When = {at: Temporal.Instant};\n'},
    target: 'builders',
    noTemporalLib: true,
    code: 'CNV007',
    says: "resolved to 'any'",
    keeps: 'export type When = {at: Temporal.Instant};',
  },
];

interface RunResult {
  status: number;
  stderr: string;
  main: string;
}

function runConvert(entry: UnsupportedCase): RunResult {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-unsupported-'));
  try {
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), entry.noTemporalLib ? TSCONFIG_NO_TEMPORAL : TSCONFIG);
    fs.mkdirSync(path.join(dir, 'src'));
    for (const [name, content] of Object.entries(entry.files)) {
      fs.writeFileSync(path.join(dir, 'src', name), name === 'main.ts' ? MARKER + content : content);
    }
    const args = ['convert', '--tsconfig', path.join(dir, 'tsconfig.json'), '--to', entry.target];
    if (entry.portable) args.push('--portable');
    args.push(path.join(dir, 'src', 'main.ts'));
    const result = spawnSync(BIN, args, {encoding: 'utf8', cwd: dir, maxBuffer: 32 * 1024 * 1024});
    return {
      status: result.status ?? -1,
      stderr: result.stderr ?? '',
      main: fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf8'),
    };
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('convert — the unsupported list', () => {
  for (const entry of UNSUPPORTED) {
    register(entry.title, {timeout: 120_000}, () => {
      const {status, stderr, main} = runConvert(entry);
      expect(stderr, `expected ${entry.code}, got:\n${stderr}`).toContain(entry.code);
      expect(stderr, `expected a message mentioning ${entry.says}, got:\n${stderr}`).toContain(entry.says);
      // A refusal is only safe if the declaration survives EXACTLY and the
      // exit code tells CI something needs attention.
      expect(main, `the refused declaration must be left untouched:\n${main}`).toContain(entry.keeps);
      expect(status, 'a refusal must exit non-zero').not.toBe(0);
    });
  }
});
