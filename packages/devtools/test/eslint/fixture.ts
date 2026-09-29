// The lint session reads a file's imports from disk (only the linted file rides the setSources overlay), so
// these fixtures are real temp projects with the built `@mionjs/run-types` where the package.json gate finds it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeMarkerPackage} from '../helpers/inline.ts';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'mion-bin/mion');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// FIXTURE_ROUTER_DTS / FIXTURE_CORE_DTS are the fake `@mionjs/router` and
// `@mionjs/core` a route fixture resolves against. Only the shapes the route
// rules read are here: the helper interfaces whose first argument is the
// handler, and the error hierarchy the returned-error rule walks.
export const FIXTURE_ROUTER_DTS = `export interface CallContext { path: string }
export type Handler = (ctx: CallContext, ...params: any[]) => any;
export interface RouteDef<H> { handler: H }
export interface RouteHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
export interface MiddlewareHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
export interface MionRouter { readonly route: RouteHelper; readonly middleware: MiddlewareHelper }
export declare function createMionRouter(opts?: unknown): MionRouter;
`;

export const FIXTURE_CORE_DTS = `export declare class TypedError<T extends string = string> extends Error { readonly type: T }
export declare class RpcError<T extends string = string> extends TypedError<T> { readonly publicMessage: string }
`;

// The fake `@mionjs/client`: the API type import check only reads which module declares `initClient`.
export const FIXTURE_CLIENT_DTS = `export declare function initClient<Api>(options: {baseURL: string}): {routes: Api};
`;

export interface FixtureProject {
  dir: string;
  // write adds/overwrites one file (relative path) and returns its abs path.
  write(rel: string, text: string): string;
  read(rel: string): string;
  cleanup(): void;
}

export function makeFixtureProject(files: Record<string, string> = {}): FixtureProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lint-'));
  const installPackage = (name: string, dts: string): void => {
    const pkgDir = path.join(dir, 'node_modules', '@mionjs', name);
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(path.join(pkgDir, 'package.json'), `{"name":"@mionjs/${name}","exports":{".":"./index.d.ts"}}`);
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), dts);
  };
  writeMarkerPackage(dir);
  // The mion route rules read these two, the API type import check the client.
  installPackage('router', FIXTURE_ROUTER_DTS);
  installPackage('core', FIXTURE_CORE_DTS);
  installPackage('client', FIXTURE_CLIENT_DTS);
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
