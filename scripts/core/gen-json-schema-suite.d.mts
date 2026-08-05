// Hand-written declarations for gen-json-schema-suite.mjs — just the exported
// surface generator.test.ts consumes (tsc picks this sibling .d.mts up when a
// TS file imports the .mjs module).

export interface SuiteFileEntry {
  label: string;
  path: string;
}

export interface LoadedGroup {
  key: string;
  description: string;
  schema: unknown;
  tests: {description: string; data: unknown; valid: boolean}[];
}

export interface TriageVerdict {
  verdict: 'ok' | 'remote' | 'proto-literal' | 'unsupported-input' | 'transform-halt';
  reason?: string;
}

export function listSuiteFiles(testsDir?: string): SuiteFileEntry[];
export function loadSuiteFile(label: string, path: string): LoadedGroup[];
export function isRemoteGroup(group: {schema: unknown}): boolean;
export function hasProtoKey(value: unknown): boolean;
export function suiteCommitFromLockfile(lockfilePath?: string): string;
export function printTsValue(value: unknown, indent?: number): string;
export function probeSnippet(schema: unknown): string;
export function runTriage(): Promise<void>;
export function readTriage(): {suiteCommit: string; groups: Record<string, TriageVerdict>};
export function emitModule(
  label: string,
  groups: LoadedGroup[],
  triageGroups: Record<string, TriageVerdict>,
  quarantineGroups: Record<string, {reason?: string}>,
  suiteCommit: string,
  harnessImport: string
): string;
export function moduleRelPath(label: string): string;
export function runGenerate(options?: object): Map<string, string>;
export function divergencesFromResults(results: object): object[];
export function ledgerKey(entry: {file: string; group: string; case: string}): string;
export function main(args: string[]): Promise<void>;
