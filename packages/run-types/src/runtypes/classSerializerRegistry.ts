/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Custom (de)serializer registry for user-defined classes. The JSON (pj /
// pjs / rj / sj) and binary (tb / fb) families consult this registry for
// plain user classes (KindClass + SubKindNone): the emitted factory looks
// the entry up by the class's structural type id through
// `utl.getClassSerializer(<id>)` and, when present, routes reconstruction
// (and optionally serialization) through it instead of the structural object
// emit. When no entry is registered the families fall back to the structural
// shape and the Go compiler emits a build-time CLS001 Warning pointing here.
//
// A plain object / interface is pure data: everything it carries survives
// JSON and comes back the same. A class instance is not — its prototype
// (methods, getters, setters) is behaviour, its constructor runs arbitrary
// logic, and it may hold values that cannot be serialised at all. So the
// wire only ever carries the DATA PROJECTION of an instance; turning that
// data back into a live object is a *code* problem the build tool cannot
// solve on its own. That is the whole reason this registry exists: the app
// hands the runtime the class (a constructor to instantiate) and, when a
// bare `new Cls()` + copy is not safe, a `deserialize` function.
//
// Both handler halves are OPTIONAL:
//   - `serialize?` omitted  -> structural encode (identical to an interface
//     of the same shape). The pipeline stringifies / binary-encodes the
//     declared props.
//   - `deserialize?` omitted -> `Object.assign(new cls(), decodedData)`.
//     Safe only for a zero-arg constructor; the overloads enforce that at
//     compile time (SerializableClass = `new () => T`). At runtime, if the
//     bare `new cls()` throws, `deserializeClass` surfaces CLS002.
//
// Builtins (Date / Map / Set / RegExp / nonSerializable) are NOT routed
// through this registry — those arms are handled structurally by the
// emitters and are not overridable. validate / getValidationErrors are
// unaffected: they always validate the class by its structural shape.
//
// The registry is keyed TWICE, both keys build-time strings:
//
//   1. The registration site's structural TYPE ID — recovered from the
//      trailing injected `id?: InjectTypeFnArgs<T, 'csr'>` slot.
//      Exact-instantiation matches (the same `T` at the registration and the
//      use site) hit this first.
//   2. The CLASS NAME, carried by the injected `csr` name-card entry
//      (its `typeName` slot — the build stamps the source class name there;
//      see the Go-side classSerializerReg family). Generics are ERASED at
//      runtime: `RpcError<'a'>` and `RpcError<'b', Data>` are the SAME class
//      object, so one `registerClassSerializer(RpcError, …)` must reconstruct
//      every instantiation the program uses. Each instantiation hashes to a
//      different structural id, but they all share the class name — the
//      emitter bakes it into the lookup (`utl.getClassSerializer('<id>',
//      '<className>')`) as a literal.
//
// The `csr` marker exists so a registration site demands ONE tiny name-card
// entry instead of the class's whole reflection graph (the pre-csr
// InjectRunTypeId form forced the full type graph into the bundle just to
// recover the name string). A legacy bare-runtype tuple (stale generated code)
// still resolves: its key is the plain type id and the name falls back to the
// reflected node when registered.
//
// Neither side ever reads runtime `cls.name`, so minification cannot skew the
// pairing (the only exception is the manual bare-string-id escape hatch, which
// has no injected entry to read — that path falls back to `cls.name` and is
// documented as not minification-safe). Two DIFFERENT classes sharing one name
// make that name ambiguous: the name lane is disabled (with a console warning)
// and only exact-id matches route through the registry for them.

import type {DataOnly} from './dataOnly.ts';
import type {InjectTypeFnArgs} from '../markers.ts';
import {isEntryTuple, initFromTuple, entryTupleKey, FN_HASH_LEN, type EntryTuple} from './entryTuple.ts';
import {getRTUtils, getRTFnCaches} from './rtUtils.ts';

/** Any class constructor. */
export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

/** A class with a ZERO-ARG constructor — safe to reconstruct with a bare
 *  `new cls()` followed by a property copy, so `deserialize` is optional. */
export interface SerializableClass<T = any> {
  new (): T;
}

/** The auto-instantiate decode contract: given the data-only projection a
 *  structural decode produced, return a live instance. */
export type DeserializeClassFn<C> = (deserialized: DataOnly<C>) => C;

/** Optional custom (de)serializer pair for one user-defined class. Both
 *  halves are optional; the type-system overloads on `registerClassSerializer`
 *  make `deserialize` mandatory for classes whose constructor takes args. */
export interface ClassSerializerHandler<T> {
  /** Optional. Omit to serialize structurally (like any interface). When
   *  provided, the user owns the wire shape (on the JSON path, keep it to the
   *  declared object properties — see the custom-wire-shape follow-up). */
  serialize?: (instance: T) => unknown;
  /** Optional for a zero-arg class (default: `Object.assign(new cls(), data)`).
   *  Receives the data-only projection a structural decode produced (methods
   *  already gone) and returns a real instance. */
  deserialize?: (data: DataOnly<T>) => T;
}

/** A stored registry entry. The emitted factory bodies read `.serialize` /
 *  `.deserialize` / `.cls` off it. */
export interface ClassSerializerEntry<T = any> {
  /** The class constructor — used to instantiate on the auto-instantiate path
   *  and as the `v instanceof cls` identity check in a union. */
  cls: AnyClass<T>;
  serialize?: (instance: T) => unknown;
  deserialize?: (data: DataOnly<T>) => T;
}

// Module-level registry. `classSerializers` holds the exact-instantiation-id
// lane; `classSerializersByName` holds the class-name fallback lane (a Set per
// name: exactly one entry → routable, two+ distinct classes → ambiguous, name
// lane disabled for that name). `classStates` is the per-class bookkeeping —
// ONE entry object per class, shared by every key it was registered under, so
// re-registering (any instantiation) updates the handlers everywhere at once
// and never evicts coverage. Backs `unregisterClassSerializer(cls)` and
// registration introspection without needing the id re-injected.
interface ClassRegistryState {
  entry: ClassSerializerEntry;
  keys: Set<string>;
  name?: string;
}
const classSerializers = new Map<string, ClassSerializerEntry>();
const classSerializersByName = new Map<string, Set<ClassSerializerEntry>>();
const classStates = new Map<AnyClass, ClassRegistryState>();
const warnedAmbiguousNames = new Set<string>();

// Monotonic epoch bumped on every registry mutation. Emitted factory bodies
// cache their `getClassSerializer(<id>)` result in the closure and only re-look
// it up when the epoch moves — so the hot path is a single int compare per call
// instead of a Map lookup, while `register` / `unregister` / `clear` still take
// effect immediately (they bump the epoch, invalidating every cached entry).
let epoch = 0;

/** Current registry epoch. Emitted decode/encode bodies read this via
 *  `utl.csEpoch()` to decide whether their cached serializer lookup is stale. */
export function classSerializerEpoch(): number {
  return epoch;
}

// The resolved registration identity: the structural TYPE id (the registry
// key the emitted codecs look up) plus, when the plugin injected the csr
// name-card tuple, that entry's full cache key (the name source).
interface ClassSerializerIdentity {
  typeId: string;
  entryKey?: string;
}

// Extract the registration identity from the injected trailing `id` slot. The
// plugin injects the `csr` name-card entry tuple (key `<csrHash>_<typeId>`);
// a wrapper / manual call may pass the bare type-id string. A legacy
// reflection tuple (stale generated code from the pre-csr marker) carries the
// bare type id as its key — cache keys are alphanumeric with exactly one `_`
// in fn keys, so the underscore split is unambiguous. Without a plugin there
// is no injected id, so registration can't be keyed — throw, since the
// emitted codecs (which the plugin produces) could never match it anyway.
function classSerializerIdentity(id: InjectTypeFnArgs<unknown, 'csr'> | undefined, cls: AnyClass): ClassSerializerIdentity {
  if (isEntryTuple(id)) {
    initFromTuple(id as unknown as EntryTuple);
    const key = entryTupleKey(id as unknown as EntryTuple);
    const separator = key.indexOf('_');
    if (separator === FN_HASH_LEN) return {typeId: key.slice(FN_HASH_LEN + 1), entryKey: key};
    return {typeId: key};
  }
  if (typeof id === 'string' && id.length > 0) return {typeId: id};
  throw new Error(
    `[ts-runtypes] registerClassSerializer(${cls.name || '<anonymous>'}): no type id injected. ` +
      `The ts-runtypes-devtools plugin must process the registration file so the class's ` +
      `type id can be injected (the registry is keyed by type id + class name).`
  );
}

// Resolve the class's SOURCE name for the name-fallback lane. The injected csr
// name card carries the build-time class name in its `typeName` slot —
// minification-proof, and identical to the literal the emitter bakes into
// `utl.getClassSerializer('<id>', '<className>')`. A legacy reflection tuple
// has no card; its reflected node (registered by initFromTuple) carries the
// same string in `node.typeName`. The manual bare-string-id path has neither,
// so it falls back to runtime `cls.name` (documented: not minification-safe).
function classSerializerName(identity: ClassSerializerIdentity, cls: AnyClass): string | undefined {
  if (identity.entryKey !== undefined) {
    // Raw cache read (getRTFnCaches, not getRT) — the name rides the entry's
    // typeName slot, so there is no reason to materialize the card's fn.
    const typeName = getRTFnCaches().rtFnsCache[identity.entryKey]?.typeName;
    if (typeof typeName === 'string' && typeName.length > 0) return typeName;
  }
  const node = getRTUtils().getRunType(identity.typeId);
  const typeName = node?.typeName;
  if (typeof typeName === 'string' && typeName.length > 0) return typeName;
  return cls.name || undefined;
}

// Add an entry to the name lane. Two DIFFERENT classes under one name make the
// name ambiguous — warn once and leave both in the set (lookups route only when
// the set has exactly one entry; exact-id matches keep working for both).
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
      `[ts-runtypes] registerClassSerializer: ${entries.size} different classes named "${name}" are registered. ` +
        `The class-name fallback is disabled for "${name}" — only exact-instantiation matches will use the registry ` +
        `(other generic instantiations of these classes fall back to structural decode).`
    );
  }
}

// Zero-arg constructor: everything optional. The client literally just hands
// over the class.
export function registerClassSerializer<T>(
  cls: SerializableClass<T>,
  handler?: ClassSerializerHandler<T>,
  id?: InjectTypeFnArgs<T, 'csr'>
): void;
// Non-empty constructor: `deserialize` is REQUIRED (auto `new cls()` is unavailable).
export function registerClassSerializer<T>(
  cls: AnyClass<T>,
  handler: ClassSerializerHandler<T> & {deserialize: (data: DataOnly<T>) => T},
  id?: InjectTypeFnArgs<T, 'csr'>
): void;
/** Register a custom (de)serializer for a user-defined class. Pass the class
 *  itself — the ENCOURAGED form needs no type argument at all:
 *
 *    registerClassSerializer(WireError, {deserialize: (data) => new WireError(…)});
 *
 *  The runtime gets the constructor (to instantiate) and the plugin injects
 *  the trailing `id` for whatever instantiation the compiler infers — which
 *  is incidental by design: one registration covers EVERY instantiation of a
 *  generic class (generics are erased at runtime — same class object) via the
 *  class-name fallback lane the emitted lookups carry. An explicit
 *  `registerClassSerializer<WireError<'x'>>(…)` still works but adds nothing.
 *  Re-registering the same class (any instantiation) updates the handlers
 *  everywhere and never drops previously covered keys. */
export function registerClassSerializer<T>(
  cls: AnyClass<T>,
  handler?: ClassSerializerHandler<T>,
  id?: InjectTypeFnArgs<T, 'csr'>
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

/** Internal lookup used by emitted factory bodies via
 *  `utl.getClassSerializer(<typeId>, <className>)`. Exact instantiation id
 *  first; otherwise the class-name fallback lane (generics are erased at
 *  runtime, so a registration made under ANY instantiation covers the rest —
 *  unless two different classes share the name, which disables that name).
 *  Returns undefined when neither lane matches (the factory then uses the
 *  structural fallback). Bodies emitted before the name lane existed pass no
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

/** Reconstruct a live instance from decoded data. Used by emitted decode
 *  bodies via `utl.deserializeClass(cs, data)`. Prefers the registered
 *  `deserialize`; otherwise auto-instantiates a zero-arg class and copies the
 *  decoded props over. Surfaces CLS002 with a clear, actionable message when
 *  the bare `new cls()` throws (constructor needs args, no `deserialize`
 *  registered) rather than a raw constructor stack. */
export function deserializeClass<T>(entry: ClassSerializerEntry<T>, data: DataOnly<T>): T {
  if (entry.deserialize) return entry.deserialize(data);
  try {
    return Object.assign(new entry.cls() as object, data) as T;
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
}

/** Remove a single registered serializer by class reference (test isolation
 *  helper). Drops every id key the class was registered under and its name
 *  lane entry (a formerly ambiguous name becomes routable again when exactly
 *  one class remains). No injected id needed. */
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
