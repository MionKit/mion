// Type-instantiation cost of each `// case:` section of the REAL route files, compiled alone, whole and params only.

import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {RESOLVING_OPTIONS} from '../../private-type-budget/test/modelPipelineHarness.ts';

const SERVER_DIR = fileURLToPath(new URL('../src/server/', import.meta.url));
const SERVER_FILE = `${SERVER_DIR}__cost_server__.ts`;
const CLIENT_FILE = `${SERVER_DIR}__cost_client__.ts`;

const OPTIONS: ts.CompilerOptions = {
  ...RESOLVING_OPTIONS,
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2023,
  moduleDetection: ts.ModuleDetectionKind.Force,
  types: ['node'],
  typeRoots: [fileURLToPath(new URL('../../../node_modules/@types/', import.meta.url))],
};

// Parsed once for the whole run: every program shares the lib, workspace and drizzle source files.
const sharedFiles = new Map<string, ts.SourceFile | undefined>();
const baseHost = ts.createCompilerHost(OPTIONS, true);

function hostFor(files: Map<string, string>): ts.CompilerHost {
  return {
    ...baseHost,
    getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate) {
      const own = files.get(fileName);
      if (own !== undefined) return ts.createSourceFile(fileName, own, languageVersionOrOptions, true);
      if (!sharedFiles.has(fileName))
        sharedFiles.set(fileName, baseHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate));
      return sharedFiles.get(fileName);
    },
    writeFile: () => {},
    fileExists: (fileName) => files.has(fileName) || baseHost.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? baseHost.readFile(fileName),
  };
}

export interface RouteCase {
  name: string;
  /** `key: mion.route(...)`, as written in the route file. */
  body: string;
  /** The same route with only its params: `key: mion.route((_ctx, ...params): void => {})`. */
  paramsOnly: string;
}

export interface SideCost {
  params: number;
  return: number;
  total: number;
}

export interface CaseCost {
  server: SideCost;
  client: SideCost;
  rawClient: number;
  errors: string[];
}

/** Splits a route file into its import header and its `// case:` sections. */
export function readRouteFile(file: string): {header: string; cases: RouteCase[]} {
  const text = readFileSync(fileURLToPath(new URL(`../src/server/${file}`, import.meta.url)), 'utf8');
  const header = text
    .split('\n')
    .filter((line) => line.startsWith('import '))
    .join('\n');
  const sections = text.split(/^\s*\/\/ case: /m).slice(1);
  const cases = sections.map((section) => {
    const [firstLine, ...rest] = section.split('\n');
    const name = firstLine.trim().split(/\s/)[0];
    const body = rest
      .join('\n')
      .replace(/\n};\s*$/, '')
      .trim()
      .replace(/,$/, '');
    return {name, body, paramsOnly: paramsOnlyOf(body)};
  });
  return {header, cases};
}

/** The route reduced to its params, so they can be measured alone. */
function paramsOnlyOf(body: string): string {
  const file = ts.createSourceFile('case.ts', `({${body}})`, ts.ScriptTarget.Latest, true);
  let result = '';
  const visit = (node: ts.Node) => {
    if (!result && ts.isCallExpression(node) && ts.isArrowFunction(node.arguments[0])) {
      const params = node.arguments[0].parameters.map((param) => param.getText(file)).join(', ');
      result = `${body.slice(0, body.indexOf(':'))}: mion.route((${params}): void => {})`;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function serverSource(header: string, body: string): string {
  return `${header}\nimport type {PublicApi} from '@mionjs/router';\nexport const routes = {\n${body}\n};\nexport type Api = PublicApi<typeof routes>;\n`;
}

function clientSource(call: string): string {
  return `import {initClient} from '@mionjs/client';\nimport type {Api} from './__cost_server__.ts';\nconst {routes} = initClient<Api>({baseURL: ''});\n${call}\n`;
}

let previous: ts.Program | undefined;

function count(files: Map<string, string>, root: string): {instantiations: number; errors: string[]} {
  // the old program only speeds up module resolution, every count is the new program's own
  const program = ts.createProgram([root], OPTIONS, hostFor(files), previous);
  previous = program;
  // only the root is checked: a client pays for what its own file needs from the server, not the whole server file
  const source = program.getSourceFile(root);
  const errors = (source ? [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)] : []).map(
    (diag) => `TS${diag.code} ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`
  );
  return {instantiations: program.getInstantiationCount(), errors};
}

/** Instantiations of one route body, on the server alone and in a client calling it, net of the empty file. */
function measureBody(header: string, body: string): {server: number; client: number; rawClient: number; errors: string[]} {
  const key = body.slice(0, body.indexOf(':')).trim();
  const call = key ? `export const result = routes.${key}(...([] as unknown as Parameters<typeof routes.${key}>)).call();` : '';
  const baseline = baselineOf(header);
  const server = count(new Map([[SERVER_FILE, serverSource(header, body)]]), SERVER_FILE);
  const client = count(
    new Map([
      [SERVER_FILE, serverSource(header, body)],
      [CLIENT_FILE, clientSource(call)],
    ]),
    CLIENT_FILE
  );
  return {
    server: server.instantiations - baseline.server,
    client: client.instantiations - baseline.client,
    rawClient: client.instantiations,
    errors: [...server.errors, ...client.errors],
  };
}

const baselines = new Map<string, {server: number; client: number}>();

/** The empty server and client of one import header, counted once. */
function baselineOf(header: string): {server: number; client: number} {
  let baseline = baselines.get(header);
  if (!baseline) {
    const server = count(new Map([[SERVER_FILE, serverSource(header, '')]]), SERVER_FILE).instantiations;
    const client = count(
      new Map([
        [SERVER_FILE, serverSource(header, '')],
        [CLIENT_FILE, clientSource('')],
      ]),
      CLIENT_FILE
    ).instantiations;
    baseline = {server, client};
    baselines.set(header, baseline);
  }
  return baseline;
}

/** One route's cost: `params` is the route with only its params, `return` is everything else (query and return type). */
export function measureCase(header: string, routeCase: RouteCase): CaseCost {
  const full = measureBody(header, routeCase.body);
  const params = measureBody(header, routeCase.paramsOnly);
  const side = (all: number, onlyParams: number): SideCost => ({params: onlyParams, return: all - onlyParams, total: all});
  return {
    server: side(full.server, params.server),
    client: side(full.client, params.client),
    rawClient: full.rawClient,
    errors: [...full.errors, ...params.errors],
  };
}

export function measureDirectModel(
  header: string,
  modulePath: string
): {client: number; whole: number; drizzleFiles: number; errors: string[]} {
  const modelFile = `${SERVER_DIR}__cost_model__.ts`;
  const client = `import type {User} from '${modulePath}'; export const name=(user:User):string=>user.name;`;
  const files = new Map([
    [modelFile, header],
    [CLIENT_FILE, client],
  ]);
  const program = ts.createProgram([CLIENT_FILE], OPTIONS, hostFor(files));
  const source = program.getSourceFile(CLIENT_FILE)!;
  program.getSyntacticDiagnostics(source);
  program.getSemanticDiagnostics(source);
  const clientCost = program.getInstantiationCount();
  const errors = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].map((diag) =>
    ts.flattenDiagnosticMessageText(diag.messageText, '\n')
  );
  return {
    client: clientCost,
    whole: program.getInstantiationCount(),
    drizzleFiles: program.getSourceFiles().filter((file) => file.fileName.includes('/node_modules/drizzle-orm/')).length,
    errors,
  };
}
