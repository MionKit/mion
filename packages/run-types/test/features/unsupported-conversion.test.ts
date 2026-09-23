// The official list of what `mion convert` cannot rewrite, run against the real binary; the conversion guide's table
// must match it. A refusal leaves that declaration byte-identical, converts the rest of the file and exits non-zero.
// Shapes the target form cannot name still convert through the `getRunType<T>()` escape, except an unbound type
// parameter or a self-reference, which the quoted escape cannot spell.
import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary, writeMarkerPackage} from '../../../devtools/test/helpers/inline.ts';

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

type Target = 'type' | 'builders';

interface UnsupportedCase {
  /** What a reader should understand the limitation to be. */
  readonly title: string;
  /** The declarations, as `src/<name>.ts`. `main.ts` is the converted file. */
  readonly files: Readonly<Record<string, string>>;
  readonly target: Target;
  readonly noTemporalLib?: true;
  readonly code: string;
  /** A distinctive fragment of the message the user is shown. */
  readonly says: string;
  /** The declaration text that must survive untouched. */
  readonly keeps: string;
}

const MARKER = "import {getRunTypeId} from '@mionjs/run-types';\n";

const UNSUPPORTED: readonly UnsupportedCase[] = [
  // ── No spelling exists for the shape ──────────────────────────────────
  // NOT listed: a generic declaration (`type Box<T> = …`). It is left as
  // written, but that is a SKIP, not a refusal — a type parameter has no
  // runtime shape, so there is nothing to convert, exactly as for a class or a
  // function declaration. It reports CNV002 at WARNING severity and the run
  // still exits 0; its INSTANTIATIONS convert wherever they are reflected.
  // (As an error it failed a whole file over one type-level helper, which is
  // what stopped the suites' own harness files converting.)
  {
    title: 'a cycle that never passes through a named type (name the inner type to fix it)',
    files: {'main.ts': "export type Outer = {inner: {back?: Outer['inner']}};\n"},
    target: 'builders',
    code: 'CNV001',
    says: 'cycle through an unnamed type',
    keeps: "export type Outer = {inner: {back?: Outer['inner']}};",
  },
  {
    title: 'a symbol-keyed member',
    files: {'main.ts': 'declare const tag: unique symbol;\nexport type Tagged = {[tag]: number};\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'symbol-keyed member',
    keeps: 'export type Tagged = {[tag]: number};',
  },
  {
    title: 'a unique symbol literal (typeof sym), which no builder can spell',
    files: {'main.ts': 'declare const sym: unique symbol;\nexport type Tag = typeof sym;\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'a literal is not convertible',
    keeps: 'export type Tag = typeof sym;',
  },
  {
    title: 'a member tagged @nonEnumerable, a descriptor no builder form carries',
    files: {'main.ts': 'export type Hidden = {\n  /** @nonEnumerable */\n  secret?: string;\n  name: string;\n};\n'},
    target: 'builders',
    code: 'CNV001',
    says: 'marked @nonEnumerable',
    keeps: '/** @nonEnumerable */\n  secret?: string;',
  },

  // NOT listed: recursive declarations. Every named recursive declaration now
  // converts — plain data shapes through RT.circular/RT.self(), and the
  // shapes RT.circular cannot carry (a getRunType escape on the cycle, a
  // cycle closing on a tuple slot) through the LAZY PAIR: the type stays a
  // real declaration and gains a `getRunType<Name>()` handle const.
  //
  // A CALL SITE has no declaration to pair with, so the same cycles refuse
  // there when the recursive type is local to the enclosing function and a
  // mapped type (DataOnly<T>, Partial<T>) stands between the call and the
  // name: the mapping hands the printer an anonymous copy of the loop. A call
  // that names the local recursive type directly is left as written instead (a
  // skip, not a refusal), since the name still works in type form; a top-level
  // recursive type converts as a declaration and its calls ride the escape.
  {
    title: 'a recursive type below the root, reaching a call site through a mapped type (DataOnly)',
    files: {
      'main.ts':
        "import {createValidateFn, type DataOnly} from '@mionjs/run-types';\n" +
        'export const validate = () => {\n' +
        '  interface Leaf {\n    name: string;\n    child?: Leaf;\n  }\n' +
        '  interface Root {\n    isRoot: true;\n    leaf: Leaf;\n  }\n' +
        '  return createValidateFn<DataOnly<Root>>();\n' +
        '};\n',
    },
    target: 'builders',
    code: 'CNV001',
    says: 'cycle through an unnamed type',
    keeps: 'createValidateFn<DataOnly<Root>>()',
  },
  {
    title: 'a recursive tuple reaching a call site through a mapped type (the cycle closes on a tuple slot)',
    files: {
      'main.ts':
        "import {createValidateFn, type DataOnly} from '@mionjs/run-types';\n" +
        'export const validate = () => {\n' +
        '  type Pair = [number, Pair?];\n' +
        '  return createValidateFn<DataOnly<Pair>>();\n' +
        '};\n',
    },
    target: 'builders',
    code: 'CNV001',
    says: 'closes on a tuple slot',
    keeps: 'createValidateFn<DataOnly<Pair>>()',
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
