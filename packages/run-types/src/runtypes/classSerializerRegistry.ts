/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Custom (de)serializer registry for user-defined classes (KindClass + SubKindNone): the JSON (pj / pjs / rj /
// sj) families look an entry up by the class's structural type id plus its build-time class
// name and route reconstruction, and optionally serialization, through it; with nothing registered they fall
// back to the structural shape, which is the right answer for a class that is pure data. The registry exists
// because a class instance is NOT pure data — its prototype is behaviour and its constructor runs arbitrary
// logic — so the wire carries only the DATA PROJECTION and rebuilding a live object is a code problem the build
// tool cannot solve: the app hands over the class and, when a bare `new Cls()` plus a property copy is not safe,
// a `deserialize`. The `csr` marker keeps a registration demanding ONE tiny name-card entry instead of the
// class's whole reflection graph. Builtins (Date / Map / Set / nonSerializable) are NOT routed here and are not
// overridable, and validate / getValidationErrors always use the class's structural shape.

import type {DataOnly} from './dataOnly.ts';
import type {InjectTypeFnArgs} from '../markers.ts';
import {isEntryTuple, initFromTuple, entryTupleKey, FN_HASH_LEN, type EntryTuple} from './entryTuple.ts';
import {getRTUtils, getRTFnCaches} from './rtUtils.ts';

export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

/** A class with a ZERO-ARG constructor: safe to rebuild with `new cls()` plus a property copy, so
 *  `deserialize` is optional. */
export interface SerializableClass<T = any> {
  new (): T;
}

/** The decode contract: given the data-only projection a structural decode produced, return a live instance. */
export type DeserializeClassFn<C> = (deserialized: DataOnly<C>) => C;

/** Custom (de)serializer pair for one user-defined class. Both halves are optional; the overloads on
 *  `registerClassSerializer` make `deserialize` mandatory for a class whose constructor takes args. */
export interface ClassSerializerHandler<T> {
  /** Omit to serialize structurally, like any interface. When provided, the user owns the wire shape (on the
   *  JSON path, keep it to the declared object properties). */
  serialize?: (instance: T) => unknown;
  /** Optional for a zero-arg class (default: `new cls()` with the declared properties set from `data`).
   *  Receives the data-only projection a structural decode produced and returns a real instance. */
  deserialize?: (data: DataOnly<T>) => T;
}

/** A stored registry entry; emitted factory bodies read `.serialize` / `.deserialize` / `.cls` off it. */
export interface ClassSerializerEntry<T = any> {
  /** Used to instantiate on the auto-instantiate path, and as the `v instanceof cls` check in a union. */
  cls: AnyClass<T>;
  serialize?: (instance: T) => unknown;
  deserialize?: (data: DataOnly<T>) => T;
}

// `classSerializers` is the exact-instantiation-id lane; `classSerializersByName` the class-name fallback lane
// (a Set per name: exactly one entry → routable, two or more distinct classes → ambiguous, lane disabled for
// that name). `classStates` holds ONE entry object per class, shared by every key it was registered under, so
// re-registering any instantiation updates the handlers everywhere at once and never evicts coverage; it also
// backs `unregisterClassSerializer(cls)` and registration introspection without the id re-injected.
interface ClassRegistryState {
  entry: ClassSerializerEntry;
  keys: Set<string>;
  name?: string;
}
const classSerializers = new Map<string, ClassSerializerEntry>();
const classSerializersByName = new Map<string, Set<ClassSerializerEntry>>();
const classStates = new Map<AnyClass, ClassRegistryState>();
const warnedAmbiguousNames = new Set<string>();

// Monotonic epoch bumped on every registry mutation. Emitted factory bodies cache their `getClassSerializer`
// result in the closure and re-look-it-up only when the epoch moves, so the hot path is one int compare instead
// of a Map lookup, while register / unregister / clear still take effect immediately.
let epoch = 0;

/** Emitted decode/encode bodies read this via `utl.csEpoch()` to tell whether their cached lookup is stale. */
export function classSerializerEpoch(): number {
  return epoch;
}

// The resolved registration identity: the structural TYPE id (the registry key the emitted codecs look up) plus,
// when the plugin injected the csr name-card tuple, that entry's full cache key (the name source).
interface ClassSerializerIdentity {
  typeId: string;
  entryKey?: string;
}

// Extract the registration identity from the injected trailing `id` slot: the plugin injects the `csr` name-card
// tuple (key `<csrHash>_<typeId>`), a wrapper or manual call may pass the bare type-id string, and a legacy
// reflection tuple carries the bare type id as its key — cache keys are alphanumeric with exactly one `_` in fn
// keys, so the underscore split is unambiguous. Without a plugin there is no id to key on, and the emitted
// codecs could never match the registration anyway, so it throws.
function classSerializerIdentity(
  id: InjectTypeFnArgs<unknown, 'classSerializerReg'> | undefined,
  cls: AnyClass
): ClassSerializerIdentity {
  if (isEntryTuple(id)) {
    initFromTuple(id as unknown as EntryTuple);
    const key = entryTupleKey(id as unknown as EntryTuple);
    const separator = key.indexOf('_');
    if (separator === FN_HASH_LEN) return {typeId: key.slice(FN_HASH_LEN + 1), entryKey: key};
    return {typeId: key};
  }
  if (typeof id === 'string' && id.length > 0) return {typeId: id};
  throw new Error(
    `[mion] registerClassSerializer(${cls.name || '<anonymous>'}): no type id injected. ` +
      `The @mionjs/devtools plugin must process the registration file so the class's ` +
      `type id can be injected (the registry is keyed by type id + class name).`
  );
}

// Resolve the class's SOURCE name for the name-fallback lane. The injected csr name card carries the build-time
// class name in its `typeName` slot — minification-proof, and identical to the literal the emitter bakes into
// `utl.getClassSerializer('<id>', '<className>')`. A legacy reflection tuple has no card, so its reflected node
// supplies the same string; the manual bare-string-id path has neither and falls back to runtime `cls.name`
// (documented: not minification-safe).
function classSerializerName(identity: ClassSerializerIdentity, cls: AnyClass): string | undefined {
  if (identity.entryKey !== undefined) {
    // Raw cache read, not getRT: the name rides the entry's typeName slot, so the card's fn never materializes.
    const typeName = getRTFnCaches().rtFnsCache[identity.entryKey]?.typeName;
    if (typeof typeName === 'string' && typeName.length > 0) return typeName;
  }
  const node = getRTUtils().getRunType(identity.typeId);
  const typeName = node?.typeName;
  if (typeof typeName === 'string' && typeName.length > 0) return typeName;
  return cls.name || undefined;
}

// Add an entry to the name lane. Two DIFFERENT classes under one name make the name ambiguous — warn once and
// leave both in the set; lookups route only when the set has exactly one entry, exact-id matches keep working.
function indexByName(name: string, entry: ClassSerializerEntry): void {
  let entries = classSerializersByName.get(name);
  if (!entries) {
    entries = new Set();
    classSerializersByName.set(name, entries);
  }
  entries.add(entry);
  if (entries.size > 1 && !warnedAmbiguousNames.has(name)) {
    warnedAmbiguousNames.add(name);
    console.warn(
      `[mion] registerClassSerializer: ${entries.size} different classes named "${name}" are registered. ` +
        `The class-name fallback is disabled for "${name}" — only exact-instantiation matches will use the registry ` +
        `(other generic instantiations of these classes fall back to structural decode).`
    );
  }
}

// Zero-arg constructor: everything optional.
export function registerClassSerializer<T>(
  cls: SerializableClass<T>,
  handler?: ClassSerializerHandler<T>,
  id?: InjectTypeFnArgs<T, 'classSerializerReg'>
): void;
// Non-empty constructor: `deserialize` is REQUIRED (auto `new cls()` is unavailable).
export function registerClassSerializer<T>(
  cls: AnyClass<T>,
  handler: ClassSerializerHandler<T> & {deserialize: (data: DataOnly<T>) => T},
  id?: InjectTypeFnArgs<T, 'classSerializerReg'>
): void;
/** Register a custom (de)serializer for a user-defined class. Pass the class itself, no type argument needed:
 *
 *    registerClassSerializer(WireError, {deserialize: (data) => new WireError(…)});
 *
 *  Whichever instantiation the compiler infers for the injected `id` is incidental: one registration covers
 *  EVERY instantiation of a generic class (generics are erased at runtime — same class object) through the
 *  class-name fallback lane. Re-registering the same class updates the handlers everywhere and never drops
 *  previously covered keys. */
export function registerClassSerializer<T>(
  cls: AnyClass<T>,
  handler?: ClassSerializerHandler<T>,
  id?: InjectTypeFnArgs<T, 'classSerializerReg'>
): void {
  if (typeof cls !== 'function') throw new Error('registerClassSerializer: cls must be a class constructor');
  const identity = classSerializerIdentity(id, cls);
  let state = classStates.get(cls);
  if (!state) {
    state = {entry: {cls}, keys: new Set()};
    classStates.set(cls, state);
  }
  // One shared entry object per class: id lane and name lane point at it, so
  // the LAST registration's handlers win for every key at once.
  state.entry.serialize = handler?.serialize as ((instance: any) => unknown) | undefined;
  state.entry.deserialize = handler?.deserialize as ((data: any) => any) | undefined;
  state.keys.add(identity.typeId);
  classSerializers.set(identity.typeId, state.entry);
  const name = classSerializerName(identity, cls);
  if (name && state.name === undefined) {
    state.name = name;
    indexByName(name, state.entry);
  }
  epoch++;
}

/** Internal lookup used by emitted factory bodies via `utl.getClassSerializer(<typeId>, <className>)`: exact
 *  instantiation id first, otherwise the class-name fallback lane (a registration made under ANY instantiation
 *  covers the rest, unless two different classes share the name, which disables it). Undefined when neither lane
 *  matches, so the factory uses the structural fallback. Bodies emitted before the name lane existed pass no
 *  className and keep the exact-id behavior. */
export function getClassSerializer(typeId: string, className?: string): ClassSerializerEntry | undefined {
  const exact = classSerializers.get(typeId);
  if (exact) return exact;
  if (!className) return undefined;
  const entries = classSerializersByName.get(className);
  if (!entries || entries.size !== 1) return undefined;
  return entries.values().next().value;
}

/** Test / introspection helper: is a serializer registered for this class? */
export function isClassSerializerRegistered(cls: AnyClass): boolean {
  return classStates.has(cls);
}

/** Reconstruct a live instance from decoded data, called by emitted decode bodies via
 *  `utl.deserializeClass(cs, data, keys)` where `keys` is the class's declared property names. Prefers the
 *  registered `deserialize`; otherwise auto-instantiates a zero-arg class and sets those declared properties.
 *  The rebuild is driven by the type, never by the keys on the wire, so an undeclared key (an own `__proto__`
 *  included) never touches the instance. Surfaces CLS002 when the bare `new cls()` throws. */
export function deserializeClass<T>(entry: ClassSerializerEntry<T>, data: DataOnly<T>, keys: readonly string[]): T {
  if (entry.deserialize) return entry.deserialize(data);
  let instance: object;
  try {
    instance = new entry.cls() as object;
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    const name = entry.cls.name || '<anonymous>';
    throw new Error(
      `[CLS002] Cannot reconstruct class "${name}": the automatic \`new ${name}()\` failed, ` +
        `so its constructor needs arguments. Register a \`deserialize\` handler: ` +
        `registerClassSerializer(${name}, {deserialize: (data) => new ${name}(/* … */)}). ` +
        `Original error: ${original}`
    );
  }
  const source = data as Record<string, unknown>;
  const target = instance as Record<string, unknown>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = source[key];
    if (value !== undefined) target[key] = value;
  }
  return instance as T;
}

/** Remove a single registered serializer by class reference (test isolation helper). Drops every id key the
 *  class was registered under and its name-lane entry, so a formerly ambiguous name becomes routable again when
 *  exactly one class remains. No injected id needed. */
export function unregisterClassSerializer(cls: AnyClass): void {
  const state = classStates.get(cls);
  if (!state) return;
  for (const key of state.keys) classSerializers.delete(key);
  if (state.name !== undefined) {
    const entries = classSerializersByName.get(state.name);
    entries?.delete(state.entry);
    if (entries && entries.size === 0) classSerializersByName.delete(state.name);
  }
  classStates.delete(cls);
  epoch++;
}

/** Clear the whole registry (test isolation helper). */
export function clearClassSerializers(): void {
  classSerializers.clear();
  classSerializersByName.clear();
  classStates.clear();
  warnedAmbiguousNames.clear();
  epoch++;
}
