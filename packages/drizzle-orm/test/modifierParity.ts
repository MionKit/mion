/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared parser behind each dialect's per-column modifier parity gate: for one
// column, the modifiers its manifest entry records, the keys its column TYPE's
// *ColMods bag accepts, and the methods its BUILDER's return interface offers.
// A mismatch means one road can spell a modifier the other refuses, which the
// union-wide gate beside it cannot see. Not part of the shipped build
// (tsconfig.build.json excludes test/).

export interface ManifestEntry {
  fn: string;
  kind: string;
  status: string;
  typeAlias?: string;
  modifiers?: string[];
}

export interface ColumnParity {
  fn: string;
  /** The *ColMods bag(s) the column type's generic constraints name. */
  bag: string | null;
  /** The Rt*Column interface(s) the builder overloads return. */
  returns: string[];
  manifestModifiers: string[];
  bagMissing: string[];
  bagExtra: string[];
  builderMissing: string[];
  builderExtra: string[];
  /** Set when the parse could not reach a bag or a single return interface. */
  unresolved: string | null;
}

/** Every *ColMods bag in a dialect's columns.ts, inheritance flattened. */
export function parseBags(source: string): Map<string, Set<string>> {
  const declared = new Map<string, {own: Set<string>; parent: string | null}>();
  for (const bag of source.matchAll(/^export interface (\w*ColMods)(?: extends ([\s\S]*?))?\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, heritage = '', body] = bag;
    const own = new Set<string>();
    // Inherited names arrive as a Pick<ColMods, 'a' | 'b'> list; reading every
    // quoted string instead would also collect value unions like 'virtual'.
    const picked = heritage.match(/Pick<\s*ColMods\s*,([\s\S]*?)>/);
    if (picked) for (const key of picked[1].matchAll(/'([\w$]+)'/g)) own.add(key[1]);
    for (const key of body.matchAll(/^ {2}([\w$]+)\?:/gm)) own.add(key[1]);
    declared.set(name, {own, parent: (heritage.match(/^\s*(\w*ColMods)\b/) ?? [])[1] ?? null});
  }
  const flattened = new Map<string, Set<string>>();
  const flatten = (name: string, seen = new Set<string>()): Set<string> => {
    const cached = flattened.get(name);
    if (cached) return cached;
    const bag = declared.get(name);
    if (!bag || seen.has(name)) return new Set();
    seen.add(name);
    const keys = new Set(bag.own);
    if (bag.parent) for (const inherited of flatten(bag.parent, seen)) keys.add(inherited);
    flattened.set(name, keys);
    return keys;
  };
  for (const name of declared.keys()) flatten(name);
  return flattened;
}

/** Every Rt*Column kind interface in a dialect's columns.ts, by method name. */
export function parseColumnInterfaces(source: string): Map<string, Set<string>> {
  const interfaces = new Map<string, Set<string>>();
  for (const found of source.matchAll(/^export interface (Rt\w*Column)<[\s\S]*?\{([\s\S]*?)^\}/gm)) {
    const methods = new Set<string>();
    for (const method of found[2].matchAll(/^ {2}([\w$]+)(?:<[^>]*>)?\(/gm)) methods.add(method[1]);
    interfaces.set(found[1], methods);
  }
  return interfaces;
}

/** Return interfaces named by a builder's overload signatures, by function. */
export function parseBuilderReturns(source: string): Map<string, Set<string>> {
  const returns = new Map<string, Set<string>>();
  for (const part of source.split(/^export function /m).slice(1)) {
    const name = (part.match(/^(\w+)/) ?? [])[1];
    if (!name) continue;
    // One overload only: stop at its terminating ';', or at the implementation's '{'.
    const semicolon = part.indexOf(';');
    const signature = part.slice(0, semicolon >= 0 ? semicolon + 1 : Math.max(part.search(/[{]/), 0));
    if (!returns.has(name)) returns.set(name, new Set());
    for (const kind of signature.matchAll(/\):\s*(Rt\w*Column)</g)) returns.get(name)!.add(kind[1]);
  }
  return returns;
}

/** Local declaration names for types the root module re-exports renamed. */
export function parseExportRenames(indexSource: string): Map<string, string> {
  const renames = new Map<string, string>();
  for (const clause of indexSource.matchAll(/export type \{([^}]*)\}/g)) {
    for (const pair of clause[1].matchAll(/(\w+)\s+as\s+(\w+)/g)) renames.set(pair[2], pair[1]);
  }
  return renames;
}

/** The bag(s) a column type's generic constraints name, or null if not found. */
function bagOfColumnType(source: string, typeName: string): string | null {
  // Lazy up to the '>' that closes the parameter list, so a one-line
  // declaration cannot run on into the next type's ' = RtColType<'.
  const declaration = source.match(new RegExp(String.raw`^export type ${typeName}<([\s\S]*?)>\s*=\s*RtColType<`, 'm'));
  if (!declaration || declaration[1].includes('\nexport ')) return null;
  const named = [...new Set([...declaration[1].matchAll(/\b(\w*ColMods)\b/g)].map((match) => match[1]))];
  return named.length ? named.join('+') : null;
}

/**
 * Compare, per migrated column, the manifest's modifiers against the keys its
 * column type's bag accepts and the methods its builder's return interface
 * offers. A column with no `typeAlias` is builders-only (mysqlEnum takes a
 * values ARRAY, not a config object), so only its builder is checked.
 */
export function columnParity(manifestEntries: ManifestEntry[], columnsSource: string, indexSource: string): ColumnParity[] {
  const bags = parseBags(columnsSource);
  const interfaces = parseColumnInterfaces(columnsSource);
  const builders = parseBuilderReturns(columnsSource);
  const renames = parseExportRenames(indexSource);
  const report: ColumnParity[] = [];

  for (const entry of manifestEntries) {
    if (entry.kind !== 'column' || entry.status !== 'migrated') continue;
    const modifiers = new Set(entry.modifiers ?? []);
    const returns = [...(builders.get(entry.fn) ?? [])];
    const typeName = entry.typeAlias ? (renames.get(entry.typeAlias) ?? entry.typeAlias) : null;
    const bag = typeName ? bagOfColumnType(columnsSource, typeName) : null;
    const bagKeys = bag ? bags.get(bag) : undefined;
    const builderMethods = returns.length === 1 ? interfaces.get(returns[0]) : undefined;

    const unresolved =
      typeName && !bagKeys
        ? `no *ColMods bag resolved for column type ${typeName} (read ${bag ?? 'nothing'})`
        : !builderMethods
          ? `builder ${entry.fn} does not resolve to exactly one Rt*Column interface (read [${returns}])`
          : null;

    report.push({
      fn: entry.fn,
      bag,
      returns,
      manifestModifiers: [...modifiers].sort(),
      bagMissing: bagKeys ? [...modifiers].filter((name) => !bagKeys.has(name)).sort() : [],
      bagExtra: bagKeys ? [...bagKeys].filter((name) => !modifiers.has(name)).sort() : [],
      builderMissing: builderMethods ? [...modifiers].filter((name) => !builderMethods.has(name)).sort() : [],
      builderExtra: builderMethods ? [...builderMethods].filter((name) => !modifiers.has(name)).sort() : [],
      unresolved,
    });
  }
  return report;
}
