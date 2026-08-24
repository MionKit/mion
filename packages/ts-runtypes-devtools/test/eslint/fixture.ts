// Shared fixture plumbing for the lint-plugin suite. Unlike the inline
// helpers (which overlay every source over one long-lived process), the lint
// session resolves a file's IMPORTS from disk — only the linted file itself
// rides the setSources overlay — so these fixtures are real temp projects:
// a directory with a fake `node_modules/ts-runtypes` package (the marker
// scanner's package.json gate needs the real layout) plus the files under
// test.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-runtypes');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// Minimal ts-runtypes package typings for the fixtures: the two marker call
// shapes, one createX factory (validate), and the enrichment DSL types. Plain
// exports (not the ambient `declare module` form) because the fixture ships
// them as a real node_modules package.
export const FIXTURE_PACKAGE_DTS = `
export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never, F5 extends string = never, F6 extends string = never, F7 extends string = never, F8 extends string = never, F9 extends string = never, F10 extends string = never, F11 extends string = never, F12 extends string = never> = string & {
  readonly __rtInjectTypeFnArgsBrand?: T;
  readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12];
};
export declare function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
export interface ValidateOptions {
  noLiterals?: boolean;
}
export declare function createValidateFn<T>(
  val?: T,
  options?: CompTimeFnArgs<ValidateOptions>,
  id?: InjectTypeFnArgs<T, 'val'>
): (value: unknown) => boolean;
export type FriendlyText<T> = Record<string, unknown> & {readonly __rtFriendly?: T};
/** @deprecated legacy alias kept so mirrors authored before the friendly-text rename still resolve */
export type FriendlyType<T> = FriendlyText<T>;
export type MockData<T> = Record<string, unknown> & {readonly __rtMock?: T};
`;

export interface FixtureProject {
  dir: string;
  // write adds/overwrites one file (relative path) and returns its abs path.
  write(rel: string, text: string): string;
  read(rel: string): string;
  cleanup(): void;
}

// makeFixtureProject creates a temp project with the fake ts-runtypes package
// installed and the given files written.
export function makeFixtureProject(files: Record<string, string> = {}): FixtureProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lint-'));
  const pkgDir = path.join(dir, 'node_modules', '@ts-runtypes', 'core');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"@ts-runtypes/core","exports":{".":"./index.d.ts"}}');
  fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), FIXTURE_PACKAGE_DTS);
  const project: FixtureProject = {
    dir,
    write(rel, text) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), {recursive: true});
      fs.writeFileSync(abs, text);
      return abs;
    },
    read(rel) {
      return fs.readFileSync(path.join(dir, rel), 'utf8');
    },
    cleanup() {
      fs.rmSync(dir, {recursive: true, force: true});
    },
  };
  for (const [rel, text] of Object.entries(files)) project.write(rel, text);
  return project;
}

// LintReportedProblem is what the mock context collects from a rule run.
export interface LintReportedProblem {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface RuleLike {
  create(context: unknown): Record<string, unknown>;
}

// runRule drives one plugin rule against a file exactly like a lint host: a
// minimal context (filename + sourceCode.text + settings + report), then the
// returned visitor's Program handler. Returns the collected reports.
export function runRule(rule: RuleLike, file: string, text: string, settings: Record<string, unknown>): LintReportedProblem[] {
  const reports: LintReportedProblem[] = [];
  const context = {
    physicalFilename: file,
    filename: file,
    sourceCode: {text},
    settings,
    report(descriptor: {message: string; loc: {start: {line: number; column: number}; end?: {line: number; column: number}}}) {
      reports.push({
        message: descriptor.message,
        line: descriptor.loc.start.line,
        column: descriptor.loc.start.column,
        ...(descriptor.loc.end ? {endLine: descriptor.loc.end.line, endColumn: descriptor.loc.end.column} : {}),
      });
    },
  };
  const visitor = rule.create(context);
  const program = visitor['Program'] as (() => void) | undefined;
  program?.();
  return reports;
}
