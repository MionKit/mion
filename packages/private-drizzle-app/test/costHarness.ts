// Type-instantiation cost of each route case, measured over the app's REAL route files: every
// `// case: <name>` section is cut out and compiled alone, once per lane (a lane swaps the db imports).

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
}

export interface Lane {
  name: string;
  /** Import path rewrites applied to the route file's header. */
  rewrites: Record<string, string>;
}

export interface CaseCost {
  server: number;
  client: number;
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
      .trim();
    return {name, body};
  });
  return {header, cases};
}

function applyRewrites(header: string, lane: Lane): string {
  return Object.entries(lane.rewrites).reduce((text, [from, to]) => text.split(`'${from}'`).join(`'${to}'`), header);
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

const baselines = new Map<string, {server: number; client: number}>();

/** The empty server and client of one import header, counted once. */
function baselineOf(laneHeader: string): {server: number; client: number} {
  let baseline = baselines.get(laneHeader);
  if (!baseline) {
    const server = count(new Map([[SERVER_FILE, serverSource(laneHeader, '')]]), SERVER_FILE).instantiations;
    const clientFiles = new Map([
      [SERVER_FILE, serverSource(laneHeader, '')],
      [CLIENT_FILE, clientSource('')],
    ]);
    baseline = {server, client: count(clientFiles, CLIENT_FILE).instantiations};
    baselines.set(laneHeader, baseline);
  }
  return baseline;
}

/** Cost of one case on one lane: the server file alone, and a client calling it through the Api type. */
export function measureCase(header: string, lane: Lane, routeCase: RouteCase): CaseCost {
  const laneHeader = applyRewrites(header, lane);
  const key = routeCase.body.slice(0, routeCase.body.indexOf(':')).trim();
  const call = `export const result = routes.${key}(...([] as unknown as Parameters<typeof routes.${key}>)).call();`;
  const baseline = baselineOf(laneHeader);
  const server = count(new Map([[SERVER_FILE, serverSource(laneHeader, routeCase.body)]]), SERVER_FILE);
  const clientFiles = new Map([
    [SERVER_FILE, serverSource(laneHeader, routeCase.body)],
    [CLIENT_FILE, clientSource(call)],
  ]);
  const client = count(clientFiles, CLIENT_FILE);
  return {
    server: server.instantiations - baseline.server,
    client: client.instantiations - baseline.client,
    errors: [...server.errors, ...client.errors],
  };
}
