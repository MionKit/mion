/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared parser behind each dialect's per-column modifier parity gate: a mismatch means one road
// can spell a modifier the other refuses, which the union-wide gate beside it cannot see.
// Not part of the shipped build (tsconfig.build.json excludes test/).

export interface ManifestEntry {
  fn: string;
  kind: string;
  status: string;
  typeAlias?: string;
  modifiers?: string[];
}

export interface ColumnParity {
  fn: string;
  /** The *ColMods bag(s) the column type's props constraint names. */
  bag: string | null;
  /** The props interface(s) the builder's overloads constrain their props by. */
  props: string[];
  manifestModifiers: string[];
  bagMissing: string[];
  bagExtra: string[];
  builderMissing: string[];
  builderExtra: string[];
  /** Set when the parse could not reach a bag or a single return interface. */
  unresolved: string | null;
}

/** Every *ColMods bag in a dialect's types.ts, inheritance flattened. */
export function parseBags(source: string): Map<string, Set<string>> {
  const declared = new Map<string, {own: Set<string>; parent: string | null}>();
  for (const bag of source.matchAll(/^export interface (\w*ColMods)(?:\s+extends ([\s\S]*?))?\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, heritage = '', body] = bag;
    const own = new Set<string>();
    // Scoped to the Pick<ColMods, ...> list: every quoted string would also collect value unions like 'virtual'.
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

/** Every builder props interface (`export interface PgColIn {...}`), its shared base included, inheritance flattened. */
export function parsePropsInterfaces(source: string): Map<string, Set<string>> {
  const declared = new Map<string, {own: Set<string>; parent: string | null}>();
  for (const found of source.matchAll(/^export interface (\w+In|\w+SharedColMods)(?: extends (\w+))? \{([\s\S]*?)^\}/gm)) {
    const own = new Set([...found[3].matchAll(/^ {2}([\w$]+)\?:/gm)].map((key) => key[1]));
    declared.set(found[1], {own, parent: found[2] ?? null});
  }
  const flatten = (name: string): Set<string> => {
    const props = declared.get(name);
    if (!props) return new Set();
    return new Set([...props.own, ...(props.parent ? flatten(props.parent) : [])]);
  };
  return new Map([...declared.keys()].map((name) => [name, flatten(name)]));
}

/** The props interfaces a builder's overloads name (`const C extends Only<C, Config & PgColIn>`), by function. */
export function parseBuilderProps(source: string): Map<string, Set<string>> {
  const builderProps = new Map<string, Set<string>>();
  for (const part of source.split(/^export function /m).slice(1)) {
    const name = (part.match(/^(\w+)/) ?? [])[1];
    if (!name) continue;
    // One overload only: stop at its terminating ';', or at the implementation's '{'.
    const semicolon = part.indexOf(';');
    const signature = part.slice(0, semicolon >= 0 ? semicolon + 1 : Math.max(part.search(/[{]/), 0));
    if (!builderProps.has(name)) builderProps.set(name, new Set());
    for (const match of signature.matchAll(/const C extends Only<C, (?:[^\n]*? & )?(\w+In)>/g))
      builderProps.get(name)!.add(match[1]);
  }
  return builderProps;
}

/** Local declaration names for types the root module re-exports renamed. */
export function parseExportRenames(indexSource: string): Map<string, string> {
  const renames = new Map<string, string>();
  for (const clause of indexSource.matchAll(/export type \{([^}]*)\}/g)) {
    for (const pair of clause[1].matchAll(/(\w+)\s+as\s+(\w+)/g)) renames.set(pair[2], pair[1]);
  }
  return renames;
}

/** The bag(s) a column type's props constraint names, or null if not found. */
function bagOfColumnType(source: string, typeName: string): string | null {
  // Lazy so a one-line declaration cannot run on into the next type's ' = Column<'.
  const declaration = source.match(new RegExp(String.raw`^export type ${typeName}<([\s\S]*?)>\s*=\s*Column<`, 'm'));
  if (!declaration || declaration[1].includes('\nexport ')) return null;
  const named = [...new Set([...declaration[1].matchAll(/\b(\w*ColMods)\b/g)].map((match) => match[1]))];
  return named.length ? named.join('+') : null;
}

/** A column with no `typeAlias` is builders-only, so only its builder is checked: mysqlEnum takes a values ARRAY. */
export function columnParity(
  manifestEntries: ManifestEntry[],
  typesSource: string,
  buildersSource: string,
  indexSource: string
): ColumnParity[] {
  const bags = parseBags(typesSource);
  const interfaces = parsePropsInterfaces(typesSource);
  const builders = parseBuilderProps(buildersSource);
  const renames = parseExportRenames(indexSource);
  const report: ColumnParity[] = [];

  for (const entry of manifestEntries) {
    if (entry.kind !== 'column' || entry.status !== 'migrated') continue;
    const modifiers = new Set(entry.modifiers ?? []);
    const props = [...(builders.get(entry.fn) ?? [])];
    const typeName = entry.typeAlias ? (renames.get(entry.typeAlias) ?? entry.typeAlias) : null;
    const bag = typeName ? bagOfColumnType(buildersSource, typeName) : null;
    const bagKeys = bag ? bags.get(bag) : undefined;
    const builderProps = props.length === 1 ? interfaces.get(props[0]) : undefined;

    const unresolved =
      typeName && !bagKeys
        ? `no *ColMods bag resolved for column type ${typeName} (read ${bag ?? 'nothing'})`
        : !builderProps
          ? `builder ${entry.fn} does not resolve to exactly one props interface (read [${props}])`
          : null;

    report.push({
      fn: entry.fn,
      bag,
      props,
      manifestModifiers: [...modifiers].sort(),
      bagMissing: bagKeys ? [...modifiers].filter((name) => !bagKeys.has(name)).sort() : [],
      bagExtra: bagKeys ? [...bagKeys].filter((name) => !modifiers.has(name)).sort() : [],
      builderMissing: builderProps ? [...modifiers].filter((name) => !builderProps.has(name)).sort() : [],
      builderExtra: builderProps ? [...builderProps].filter((name) => !modifiers.has(name)).sort() : [],
      unresolved,
    });
  }
  return report;
}
