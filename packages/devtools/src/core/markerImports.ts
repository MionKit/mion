// Cheap text gate for files that may hold marker calls, shared by the lint pre-filter and the build fallback for
// files the type scan has not seen, so the two cannot drift. It follows imports: a package or local module wrapping
// a marker (a drizzle dialect's `tableFromType<T>()`) hands it to files that never name the marker package.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MARKER_MODULE = '@mionjs/run-types';

export interface MarkerGateOptions {
  packages?: string[];
  checkPackage?: boolean;
}

// Static, side-effect and dynamic import specifiers, plus require() ones.
const specifierPattern = /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

// Local imports are followed one level only: a wrapper of a wrapper is missed.
const LOCAL_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const packageVerdicts = new Map<string, boolean>();
const packageJsonLookups = new Map<string, string>();
const localVerdicts = new Map<string, {mtimeMs: number; verdict: boolean}>();

// With checkPackage:false a marker can be declared anywhere, so every file passes.
export function mayHoldMarkerCalls(text: string, file: string | undefined, markers?: MarkerGateOptions): boolean {
  if (markers?.checkPackage === false) return true;
  const modules = markerModules(markers);
  if (namesMarkerModule(text, modules)) return true;
  if (!file) return false;
  const fromDir = path.dirname(file);
  for (const specifier of importSpecifiers(text)) {
    if (isRelative(specifier)) {
      if (localFileMayHoldMarkers(fromDir, specifier, modules)) return true;
    } else if (packageDependsOnMarkers(fromDir, specifier, modules)) {
      return true;
    }
  }
  return false;
}

function markerModules(markers?: MarkerGateOptions): string[] {
  return [DEFAULT_MARKER_MODULE, ...(markers?.packages ?? [])];
}

// Quoted only, so a path in a comment never forces a scan.
// `registerPureFn` catches the marker package's own sources (relative imports) and `registerPureFnFactory` too.
function namesMarkerModule(text: string, modules: string[]): boolean {
  return modules.some((mod) => text.includes(`'${mod}`) || text.includes(`"${mod}`)) || text.includes('registerPureFn');
}

function importSpecifiers(text: string): Set<string> {
  const specifiers = new Set<string>();
  for (const match of text.matchAll(specifierPattern)) specifiers.add(match[2]!);
  return specifiers;
}

const isRelative = (specifier: string): boolean => specifier.startsWith('./') || specifier.startsWith('../');

// Skips relative imports, which keeps local wrappers one level deep.
function directlyMayHoldMarkers(text: string, fromDir: string, modules: string[]): boolean {
  if (namesMarkerModule(text, modules)) return true;
  for (const specifier of importSpecifiers(text)) {
    if (!isRelative(specifier) && packageDependsOnMarkers(fromDir, specifier, modules)) return true;
  }
  return false;
}

function localFileMayHoldMarkers(fromDir: string, specifier: string, modules: string[]): boolean {
  const resolved = resolveLocalFile(path.resolve(fromDir, specifier));
  if (!resolved) return false;
  const key = `${resolved.file}\0${modules.join(',')}`;
  const cached = localVerdicts.get(key);
  if (cached && cached.mtimeMs === resolved.mtimeMs) return cached.verdict;
  let verdict = false;
  try {
    verdict = directlyMayHoldMarkers(fs.readFileSync(resolved.file, 'utf8'), path.dirname(resolved.file), modules);
  } catch {
    verdict = false;
  }
  localVerdicts.set(key, {mtimeMs: resolved.mtimeMs, verdict});
  return verdict;
}

// Bundler-style TS resolution (a `.js` specifier may name its `.ts` source); tsconfig `paths` are not followed.
function resolveLocalFile(base: string): {file: string; mtimeMs: number} | undefined {
  const withoutJs = base.replace(/\.([mc]?)jsx?$/, '');
  const candidates = [
    base,
    ...LOCAL_EXTENSIONS.map((ext) => base + ext),
    ...(withoutJs !== base ? ['.ts', '.tsx', '.mts', '.cts'].map((ext) => withoutJs + ext) : []),
    ...LOCAL_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return {file: candidate, mtimeMs: stat.mtimeMs};
    } catch {
      // not this candidate
    }
  }
  return undefined;
}

function packageName(specifier: string): string | undefined {
  if (specifier.startsWith('node:') || specifier.startsWith('/') || specifier.startsWith('#')) return undefined;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  return parts[0] || undefined;
}

// A package depending on a marker module can hand a marker parameter to its importer through its typings.
function packageDependsOnMarkers(fromDir: string, specifier: string, modules: string[]): boolean {
  const name = packageName(specifier);
  if (!name) return false;
  if (modules.includes(name)) return true;
  const packageJson = findPackageJson(fromDir, name);
  if (!packageJson) return false;
  const key = `${packageJson}\0${modules.join(',')}`;
  const cached = packageVerdicts.get(key);
  if (cached !== undefined) return cached;
  let verdict = false;
  try {
    const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as Record<string, Record<string, string> | undefined>;
    const dependencies = [manifest['dependencies'], manifest['peerDependencies'], manifest['optionalDependencies']];
    verdict = dependencies.some((group) => !!group && modules.some((mod) => mod in group));
  } catch {
    verdict = false;
  }
  packageVerdicts.set(key, verdict);
  return verdict;
}

// Node-style walk up (pnpm symlinks read through), also matching a package importing itself by name.
// A miss is not cached, so a package installed mid-session is seen on the next lint.
function findPackageJson(fromDir: string, name: string): string | undefined {
  const lookupKey = `${fromDir}\0${name}`;
  const cached = packageJsonLookups.get(lookupKey);
  if (cached) return cached;
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const installed = path.join(dir, 'node_modules', name, 'package.json');
    const own = path.join(dir, 'package.json');
    const found = fs.existsSync(installed) ? installed : manifestName(own) === name ? own : undefined;
    if (found) {
      packageJsonLookups.set(lookupKey, found);
      return found;
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

function manifestName(packageJson: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(packageJson, 'utf8')) as {name?: string}).name;
  } catch {
    return undefined;
  }
}
