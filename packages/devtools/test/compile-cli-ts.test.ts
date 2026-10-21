// `mion compile --emit-mode ts` over the REAL marker package: the TypeScript tree it writes type-checks under the
// strictest tsconfig, runs under plain node (type stripping), and strips back to exactly what emitMode both ships.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hasBinary} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';
import {stripParityViolation, stripTypeScript, strictestTypeCheck, typeModuleViolation} from './helpers/typedEmit.ts';

const register = hasBinary() ? it : it.skip;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2023"], "types": [],
    "rootDir": "src", "outDir": "dist", "strict": true, "skipLibCheck": true,
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true
  },
  "include": ["src"]
}
`;

const MODELS_TS = `export interface Address {street: string; zip: number; tags?: string[]}
export class Account {
  id: number;
  opened: Date;
  constructor(id: number, opened: Date) {
    this.id = id;
    this.opened = opened;
  }
  close(): void {}
}
export type Role = 'admin' | 'user';
export interface User {
  id: number;
  name: string;
  email?: string;
  createdAt: Date;
  address: Address;
  roles: Role[];
  meta: Record<string, number>;
  lookup: Map<string, Address>;
  big: bigint;
  account: Account;
  greet(): string;
}
export type Shape = {kind: 'circle'; r: number} | {kind: 'square'; side: number};
export interface TreeNode {value: string; children: TreeNode[]}
`;

const MAIN_TS = `import {
  createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn,
  getRunTypeId,
} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';
import {registerPureFn, getRTUtils} from '@mionjs/run-types/runtime';
import {Account, type User, type Shape, type TreeNode} from './models.ts';
declare const process: {stdout: {write(text: string): void}};

const isUser = createValidateFn<User>();
const strictUser = createValidateFn<User>(undefined, {checkUnknowns: true});
const userErrors = createGetValidationErrorsFn<User>();
const isShape = createValidateFn<Shape>();
const isTree = createValidateFn<TreeNode>();
const isName = createValidateFn<TF.String<{minLength: 3}>>();
const encodeUser = createJsonEncoderFn<User>();
const decodeUser = createJsonDecoderFn<User>();
const stripUser = createRemoveUnknownKeysFn<User>();
const shout = registerPureFn((text: string) => text.toUpperCase());
const staticId = getRunTypeId<TreeNode>();
const sample: TreeNode = {value: 'a', children: []};
const reflectedId = getRunTypeId(sample);

const user: User = {
  id: 1, name: 'ann', createdAt: new Date(0), address: {street: 's', zip: 1}, roles: ['admin'], meta: {a: 1},
  lookup: new Map([['home', {street: 'h', zip: 2}]]), big: 10n, account: new Account(7, new Date(1)), greet: () => 'hi',
};
const decoded = decodeUser(encodeUser(user) ?? '');
process.stdout.write('<<RT>>' + JSON.stringify({
  valid: isUser(user),
  invalid: isUser({...user, id: 'x'}),
  strictRejectsExtra: strictUser({...user, extra: true}),
  errors: userErrors({...user, id: 'x'}),
  shapes: [isShape({kind: 'circle', r: 1}), isShape({kind: 'square', r: 1})],
  tree: isTree({value: 'a', children: [{value: 'b', children: []}]}),
  name: [isName('ann'), isName('an')],
  roundTrip: decoded.createdAt instanceof Date && decoded.big === 10n && decoded.lookup.get('home')?.zip === 2,
  stripped: Object.keys(stripUser({...user, extra: 1} as User)).includes('extra'),
  shout: getRTUtils().getPureFnByKey(shout)!('hi'),
  sameId: staticId === reflectedId,
}) + '<<RT>>');
`;

function writeProject(base: string): string {
  const project = path.join(base, 'app');
  fs.mkdirSync(path.join(project, 'src'), {recursive: true});
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({name: '@acme/typed-app', private: true, type: 'module'}));
  fs.writeFileSync(path.join(project, 'tsconfig.json'), TSCONFIG);
  const scope = path.join(project, 'node_modules', '@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(path.resolve(__dirname, '../../run-types'), path.join(scope, 'run-types'), 'dir');
  fs.writeFileSync(path.join(project, 'src', 'models.ts'), MODELS_TS);
  fs.writeFileSync(path.join(project, 'src', 'main.ts'), MAIN_TS);
  return project;
}

function filesUnder(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, {recursive: true}) as string[])
    .filter((name) => name.endsWith(extension))
    .map((name) => name.split(path.sep).join('/'))
    .sort();
}

describe('mion compile --emit-mode ts', () => {
  register(
    'writes a TypeScript tree that type-checks strictly, runs, and strips to emitMode both',
    () => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-ts-'));
      try {
        const project = writeProject(base);
        const both = runCli(
          [
            'compile',
            '--cwd',
            project,
            '--tsconfig',
            'tsconfig.json',
            '--gen-dir',
            path.join(base, 'both'),
            '--emit-mode',
            'both',
          ],
          {
            label: 'compile-cli-ts-both',
          }
        );
        expect(both.status, both.report).toBe(0);
        fs.rmSync(path.join(project, 'dist'), {recursive: true, force: true});
        const typed = runCli(
          [
            'compile',
            '--cwd',
            project,
            '--tsconfig',
            'tsconfig.json',
            '--gen-dir',
            path.join(project, '.mion'),
            '--emit-mode',
            'ts',
          ],
          {
            label: 'compile-cli-ts',
          }
        );
        expect(typed.status, typed.report).toBe(0);

        // A TypeScript tree, no JavaScript beside the pure-fn artifact other builds read as data.
        expect(filesUnder(path.join(project, 'dist'), '.js').filter((name) => !name.startsWith('mion-pure-fns/'))).toEqual([]);
        expect(filesUnder(path.join(project, 'dist'), '.ts')).toEqual(['main.ts', 'models.ts']);
        // The pure-fn artifact other builds read stays plain JS: stripping types changes nothing.
        const pureFnFiles = filesUnder(path.join(project, 'dist', 'mion-pure-fns'), '.js');
        expect(pureFnFiles.length).toBeGreaterThan(0);
        for (const name of pureFnFiles) {
          const text = fs.readFileSync(path.join(project, 'dist', 'mion-pure-fns', name), 'utf8');
          expect(stripTypeScript(text), name).toBe(text);
        }
        const typesDir = path.join(project, '.mion', 'types');
        expect(filesUnder(typesDir, '.js')).toEqual([]);
        expect(filesUnder(typesDir, '.ts').some((name) => name.startsWith('t/'))).toBe(true);

        // (a) Zero errors under the strictest consumer tsconfig.
        expect(strictestTypeCheck(project, ['dist', '.mion'])).toBe('');

        // (b) Plain node runs the tree (type stripping), every compiled fn answering correctly.
        const stdout = execFileSync(process.execPath, [path.join(project, 'dist', 'main.ts')], {cwd: project, encoding: 'utf8'});
        const payload = /<<RT>>(.*)<<RT>>/s.exec(stdout);
        expect(payload, stdout).toBeTruthy();
        expect(JSON.parse(payload![1])).toEqual({
          valid: true,
          invalid: false,
          strictRejectsExtra: false,
          errors: [{expected: 'number', path: ['id']}],
          shapes: [true, false],
          tree: true,
          name: [true, false],
          roundTrip: true,
          stripped: false,
          shout: 'HI',
          sameId: true,
        });

        // (c) Strip parity: each typed module minus its types IS the module emitMode both ships, code string included,
        // and a type module strips to nothing but its doc comment.
        const bothModules = filesUnder(path.join(base, 'both', 'types'), '.js');
        const typedModules = filesUnder(typesDir, '.ts');
        expect(bothModules.length).toBeGreaterThan(5);
        for (const name of typedModules) {
          const typedModule = fs.readFileSync(path.join(typesDir, name), 'utf8');
          if (name.startsWith('t/')) {
            expect(typeModuleViolation(name, typedModule)).toBeNull();
            continue;
          }
          const twin = name.replace(/\.ts$/, '.js');
          expect(bothModules, `${name} has no emitMode both twin`).toContain(twin);
          expect(
            stripParityViolation(name, typedModule, fs.readFileSync(path.join(base, 'both', 'types', twin), 'utf8'))
          ).toBeNull();
        }
        expect(typedModules.filter((name) => !name.startsWith('t/')).length).toBe(bothModules.length);
      } finally {
        fs.rmSync(base, {recursive: true, force: true});
      }
    },
    180_000
  );
});
