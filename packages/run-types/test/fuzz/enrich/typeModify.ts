// The FOURTH giant switch — the mirror image of typeGen.ts. Where the generator
// BUILDS a random type from nothing, this MODIFIES an existing one the way a
// developer edits a file mid-session: rename the whole type, rename a property,
// add / delete / retype a leaf deep in the tree, or (deliberately) leave the
// source in a broken, half-typed state. It is the operation alphabet the
// enrich-reconciler fuzzer drives — the reconciler must survive every one of
// these without crashing or losing authored content.
//
// Two flavours, chosen by the `allowInvalid` flag:
//   - VALID edits mutate the type MODEL in place (decls + shapes) and re-render
//     to clean, type-checking TypeScript. The model stays the source of truth so
//     the next edit composes on top.
//   - INVALID edits are TEXT-level corruptions (a truncated string literal, a
//     dropped brace, a stray token): they render the *current valid model* and
//     damage the bytes, WITHOUT touching the model — exactly like a save fired
//     mid-keystroke. The next valid edit renders from the intact model again, so
//     a corruption is always a transient blip, never permanent state.
//
// Everything draws from a passed `rng` so a seed replays the whole edit sequence.

import {
  FUZZ_FORMAT_SCRATCH_PREAMBLE,
  flattenHeritage,
  inheritedProps,
  renderDecl,
  usesFormatLeaves,
  type Decl,
  type GeneratedType,
  type PropShape,
  type TypeShape,
} from '../core/typeGen.ts';

// A "rooted" type is the unit the gen CLI targets: a set of exported decls plus
// the NAME of the one the `createX<Root>()` / `gen <Root>` site points at. A
// whole-type rename changes `rootName`, so the driver always re-reads it.
export interface RootedType {
  decls: Decl[];
  rootName: string;
}

export interface ModifyOptions {
  // When true the switch may pick a corruption that yields unparseable / non
  // type-checking source. When false every edit stays valid TypeScript.
  allowInvalid: boolean;
}

// The two anchor fields rootGeneratedType always adds (typed string / number, on the
// root const, which never orphans). The fuzzer authors labels on these and the
// modifier never DELETES or RENAMES them, so they are stable carriers of authored
// content while every OTHER part of the type churns — the basis of the nothing-lost
// oracle. (Retyping them is fine: the field survives, its label rides along.)
export const ANCHOR_FIELDS = ['lbl0', 'lbl1'];

// How the driver should judge the reconcile after this edit:
//   'valid'       — type-checks; expect a clean reconcile + convergence.
//   'unparseable' — a deliberate source corruption; tsgo may error-recover (gen
//                   succeeds on a changed type) or hard-fail (gen no-ops) — the
//                   driver OBSERVES which and asserts accordingly.
export type EditClass = 'valid' | 'unparseable';

export interface ModifyResult {
  rooted: RootedType;
  // Non-null ONLY for a corruption: render THIS verbatim instead of the model.
  rawSource: string | null;
  editClass: EditClass;
  // Human-readable label for logs / shrinker output, e.g. "renameProp p0→p0x".
  op: string;
}

// --- rendering -----------------------------------------------------------------

// Render a rooted type to a source module: every decl exported so the resolver
// can target any of them by name. `renderDecl` already emits `interface` /
// `type` / `declare class` / `enum`; prefixing `export ` keeps all valid.
// Format/not leaves reference `TF.*` names, carried by the IMPORT-FREE scratch
// preamble (a local namespace): these fixtures live in temp dirs where a
// relative `./src/...` import cannot resolve, which is also why the generator
// runs on SCRATCH_FORMAT_LEAVES — the only leaves that preamble can spell.
export function renderRootedSource(rooted: RootedType): string {
  const decls = rooted.decls.map((decl) => `export ${renderDecl(decl)}`).join('\n') + '\n';
  const usesFormats = usesFormatLeaves({decls: rooted.decls, root: {kind: 'null'}});
  return usesFormats ? `${FUZZ_FORMAT_SCRATCH_PREAMBLE}\n${decls}` : decls;
}

// --- seeded helpers ------------------------------------------------------------

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}
function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}
// A short, identifier-safe token derived from the rng — deterministic per seed.
function token(rng: () => number): string {
  return Math.floor(rng() * 0xfffff).toString(36);
}

// --- heritage ------------------------------------------------------------------
//
// A derived declaration carries TWO member lists. `props` is the flattened view
// (inherited, then own) — the checker's view, and what the ops read. `ownProps`
// is what the declaration itself spells, and the only thing `renderDecl` prints.
// So every edit lands on `ownProps`, and `settleHeritage` rebuilds `props` right
// after: an edit written to only one of them is a model that disagrees with the
// source it renders, which is the drift this lane exists to expose in the
// reconciler rather than to produce itself.

// A declaration that carries members — the only kinds that take part in `extends`.
type MemberDecl = Extract<Decl, {props: PropShape[]}>;

function isMemberDecl(decl: Decl): decl is MemberDecl {
  return decl.kind === 'interface' || decl.kind === 'class';
}

// The members this declaration itself spells — on a declaration with no heritage
// that IS its whole member list.
function ownPropsOf(decl: MemberDecl): PropShape[] {
  return decl.ownProps ?? decl.props;
}

// The members `decl` inherits, in the order the checker merges them.
function inheritedOf(decl: Decl, byName: Map<string, Decl>): PropShape[] {
  if (!isMemberDecl(decl) || !decl.extends?.length) return [];
  const bases = decl.extends.map((name) => byName.get(name)).filter((base): base is Decl => base !== undefined);
  return inheritedProps(bases);
}

// The own members that restate an inherited name: those are narrowing OVERRIDES,
// and their shape and flags are dictated by the member they narrow.
function overrideNames(decl: Decl, byName: Map<string, Decl>): Set<string> {
  if (!isMemberDecl(decl)) return new Set();
  const inherited = new Set(inheritedOf(decl, byName).map((prop) => prop.name));
  return new Set(
    ownPropsOf(decl)
      .map((prop) => prop.name)
      .filter((name) => inherited.has(name))
  );
}

// Every member name a declaration must steer clear of: its own flattened view
// (own + inherited) plus what anything extending it spells. A name free HERE but
// already spelled by a subclass would become an incompatible redeclaration there.
// Declarations stay in declaration order (a base always ahead of what extends
// it), so one forward pass reaches the whole subtree.
function namesInScope(decl: MemberDecl, decls: Decl[]): Set<string> {
  const names = new Set(decl.props.map((prop) => prop.name));
  const family = new Set([decl.name]);
  for (const other of decls) {
    if (!isMemberDecl(other) || !other.extends?.some((base) => family.has(base))) continue;
    family.add(other.name);
    for (const prop of other.props) names.add(prop.name);
  }
  return names;
}

// A literal that narrows `base`, reusing the current one when it still fits.
// Only the three primitives are narrowable; anything else means the override has
// to go. Deterministic on purpose — a repair must never consume an rng draw, or
// the same seed would replay a different edit stream.
function narrowingLiteral(base: PropShape, current: TypeShape): TypeShape | null {
  const value = current.kind === 'literal' ? current.value : undefined;
  switch (base.shape.kind) {
    case 'string':
      return {kind: 'literal', value: typeof value === 'string' ? value : 'fixed'};
    case 'number':
      return {kind: 'literal', value: typeof value === 'number' ? value : 0};
    case 'boolean':
      return {kind: 'literal', value: typeof value === 'boolean' ? value : true};
    default:
      return null;
  }
}

// Re-derive a declaration's narrowing overrides against the members they now
// narrow. An edit on the BASE side can invalidate one — the member was retyped,
// or its optional / readonly flags moved — and TypeScript rejects an override
// that no longer narrows, so each is repaired (keeping its literal when that
// still fits) or dropped when the base member stopped being a plain primitive.
function repairOverrides(decl: MemberDecl, inherited: PropShape[]): void {
  if (!decl.ownProps) return;
  const byName = new Map(inherited.map((prop) => [prop.name, prop] as const));
  decl.ownProps = decl.ownProps.filter((prop) => {
    const base = byName.get(prop.name);
    if (!base) return true; // an own member of its own, nothing to narrow
    const literal = narrowingLiteral(base, prop.shape);
    if (!literal) return false;
    prop.shape = literal;
    prop.optional = base.optional;
    prop.readonly = base.readonly;
    return true;
  });
}

// Rebuild every derived declaration's flattened view, repairing the overrides the
// edit invalidated. Runs after EVERY valid edit, so the next operation reads a
// model that still matches the source it renders.
function settleHeritage(decls: Decl[]): void {
  flattenHeritage(decls, repairOverrides);
}

// --- model traversal -----------------------------------------------------------

// A mutable position holding one TypeShape. `set` writes back into the parent
// (an array element, a prop's shape, a map value, …), so an edit at any depth is
// a single `slot.set(newShape)`.
interface Slot {
  get(): TypeShape;
  set(shape: TypeShape): void;
}

// The direct child slots of one shape (empty for leaves).
function childSlots(shape: TypeShape): Slot[] {
  switch (shape.kind) {
    case 'array':
    case 'set':
      return [{get: () => shape.elem, set: (s) => (shape.elem = s)}];
    case 'record':
    case 'promise':
      return [{get: () => shape.value, set: (s) => (shape.value = s)}];
    case 'map':
      return [
        {get: () => shape.key, set: (s) => (shape.key = s)},
        {get: () => shape.value, set: (s) => (shape.value = s)},
      ];
    case 'tuple':
      return shape.elems.map((_, i) => ({get: () => shape.elems[i], set: (s) => (shape.elems[i] = s)}));
    case 'union':
    case 'intersection':
      return shape.members.map((_, i) => ({get: () => shape.members[i], set: (s) => (shape.members[i] = s)}));
    case 'function': {
      const slots: Slot[] = shape.params.map((_, i) => ({get: () => shape.params[i], set: (s) => (shape.params[i] = s)}));
      slots.push({get: () => shape.ret, set: (s) => (shape.ret = s)});
      return slots;
    }
    case 'object': {
      const slots: Slot[] = shape.props.map((prop) => ({get: () => prop.shape, set: (s) => (prop.shape = s)}));
      if (shape.index) slots.push({get: () => shape.index as TypeShape, set: (s) => (shape.index = s)});
      return slots;
    }
    default:
      return [];
  }
}

// Every shape slot anywhere under the decls, depth-first. Used to retype / wrap
// a leaf, or to rewrite every `ref` after a rename.
function allSlots(decls: Decl[]): Slot[] {
  const out: Slot[] = [];
  const byName = new Map(decls.map((decl) => [decl.name, decl] as const));
  const recurse = (slot: Slot): void => {
    out.push(slot);
    for (const child of childSlots(slot.get())) recurse(child);
  };
  for (const decl of decls) {
    if (isMemberDecl(decl)) {
      // Walk the members this declaration SPELLS, so each one is reached exactly
      // once, through the declaration that renders it — and skip its narrowing
      // OVERRIDES, whose shape is dictated by the base member (retyping one stops
      // the source compiling, and settleHeritage would only put it back).
      const overrides = overrideNames(decl, byName);
      for (const prop of ownPropsOf(decl)) {
        if (overrides.has(prop.name)) continue;
        recurse({get: () => prop.shape, set: (s) => (prop.shape = s)});
      }
      if (decl.kind === 'interface' && decl.calls) {
        for (const sig of decl.calls) {
          sig.params.forEach((_, i) => recurse({get: () => sig.params[i], set: (s) => (sig.params[i] = s)}));
          recurse({get: () => sig.ret, set: (s) => (sig.ret = s)});
        }
      }
    } else if (decl.kind === 'type') {
      const typeDecl = decl;
      recurse({get: () => typeDecl.shape, set: (s) => (typeDecl.shape = s)});
    }
  }
  return out;
}

// One editable member list plus the names around it.
//
// On a plain object shape the two lists are the same thing. On a DERIVED
// declaration they are not: `props` is what the declaration itself spells (the
// only members an edit may touch), `taken` also carries the inherited names and
// the names anything extending it spells, and `pinned` names the narrowing
// overrides, whose shape and flags belong to the base member rather than here.
interface PropOwner {
  props: PropShape[];
  taken: Set<string>;
  pinned: Set<string>;
}

// Every object-like node carrying members (object shapes + interface / class
// decls) — the targets for add / delete / rename property.
function propOwners(decls: Decl[]): PropOwner[] {
  const byName = new Map(decls.map((decl) => [decl.name, decl] as const));
  const out: PropOwner[] = [];
  const visit = (shape: TypeShape): void => {
    if (shape.kind === 'object') {
      out.push({props: shape.props, taken: new Set(shape.props.map((prop) => prop.name)), pinned: new Set()});
    }
    for (const child of childSlots(shape)) visit(child.get());
  };
  for (const decl of decls) {
    if (isMemberDecl(decl)) {
      const own = ownPropsOf(decl);
      out.push({props: own, taken: namesInScope(decl, decls), pinned: overrideNames(decl, byName)});
      own.forEach((prop) => visit(prop.shape));
    } else if (decl.kind === 'type') visit(decl.shape);
  }
  return out;
}

const LEAF_KINDS = new Set<TypeShape['kind']>([
  'number',
  'string',
  'boolean',
  'bigint',
  'null',
  'undefined',
  'date',
  'regexp',
  'literal',
  'symbol',
  'arraybuffer',
  'sharedarraybuffer',
  'dataview',
  'typedarray',
  'ref',
]);
function isLeaf(shape: TypeShape): boolean {
  return LEAF_KINDS.has(shape.kind);
}

// A fresh serialisable leaf — what add / retype reach for so the result still
// round-trips (the reconciler scaffolds an authorable node for each of these).
function randomLeaf(rng: () => number): TypeShape {
  const builders: Array<() => TypeShape> = [
    () => ({kind: 'string'}),
    () => ({kind: 'number'}),
    () => ({kind: 'boolean'}),
    () => ({kind: 'bigint'}),
    () => ({kind: 'date'}),
    () => ({kind: 'regexp'}),
    () => ({kind: 'null'}),
    () => ({kind: 'literal', value: pick(['on', 'off', 'red'], rng)}),
  ];
  return pick(builders, rng)();
}

// A fresh small shape for a newly-added property — usually a leaf, sometimes an
// array of leaves or a tiny object, so additions exercise nested scaffolding.
function randomSmallShape(rng: () => number): TypeShape {
  const roll = rng();
  if (roll < 0.6) return randomLeaf(rng);
  if (roll < 0.8) return {kind: 'array', elem: randomLeaf(rng)};
  return {
    kind: 'object',
    props: [
      {name: 'a', optional: false, readonly: false, method: false, shape: randomLeaf(rng)},
      {name: 'b', optional: chance(rng, 0.5), readonly: false, method: false, shape: randomLeaf(rng)},
    ],
  };
}

function declNames(decls: Decl[]): Set<string> {
  return new Set(decls.map((decl) => decl.name));
}
function freshTypeName(decls: Decl[], rng: () => number): string {
  const taken = declNames(decls);
  let name = `T_${token(rng)}`;
  while (taken.has(name)) name = `T_${token(rng)}`;
  return name;
}
function freshPropName(taken: Set<string>, rng: () => number): string {
  let name = `q_${token(rng)}`;
  while (taken.has(name)) name = `q_${token(rng)}`;
  return name;
}

// Point every USE of `oldName` at `newName` — a rename carries through the whole
// graph, not just the declaration. That means the `ref` shapes AND the `extends`
// clauses, which name a declaration in the rendered source but are not shapes, so
// no slot walk reaches them.
function renameTypeUses(decls: Decl[], oldName: string, newName: string): void {
  for (const slot of allSlots(decls)) {
    const shape = slot.get();
    if (shape.kind === 'ref' && shape.name === oldName) slot.set({kind: 'ref', name: newName});
  }
  for (const decl of decls) {
    if (isMemberDecl(decl) && decl.extends) {
      decl.extends = decl.extends.map((base) => (base === oldName ? newName : base));
    }
  }
}

// --- the valid operations (model-level) ----------------------------------------

interface ValidOp {
  name: string;
  can(rooted: RootedType): boolean;
  apply(rooted: RootedType, rng: () => number): string;
}

const renameRoot: ValidOp = {
  name: 'renameRoot',
  can: () => true,
  apply(rooted, rng) {
    const oldName = rooted.rootName;
    const newName = freshTypeName(rooted.decls, rng);
    const decl = rooted.decls.find((candidate) => candidate.name === oldName);
    if (decl) decl.name = newName;
    renameTypeUses(rooted.decls, oldName, newName);
    rooted.rootName = newName;
    return `renameRoot ${oldName}→${newName}`;
  },
};

const renameDecl: ValidOp = {
  name: 'renameDecl',
  can: (rooted) => rooted.decls.some((decl) => decl.name !== rooted.rootName),
  apply(rooted, rng) {
    const others = rooted.decls.filter((decl) => decl.name !== rooted.rootName);
    const decl = pick(others, rng);
    const oldName = decl.name;
    const newName = freshTypeName(rooted.decls, rng);
    decl.name = newName;
    renameTypeUses(rooted.decls, oldName, newName);
    return `renameDecl ${oldName}→${newName}`;
  },
};

// Props that may be renamed / deleted — everything except the stable anchors.
// A narrowing override is fair game here: renaming or dropping one leaves valid
// TypeScript (the inherited member simply shows through again).
function mutableProps(owner: PropOwner): PropShape[] {
  return owner.props.filter((prop) => !ANCHOR_FIELDS.includes(prop.name));
}

// Props whose FLAGS may be toggled — everything except the narrowing overrides,
// which copy their optional / readonly from the member they narrow.
function reflaggableProps(owner: PropOwner): PropShape[] {
  return owner.props.filter((prop) => !owner.pinned.has(prop.name));
}

const renameProp: ValidOp = {
  name: 'renameProp',
  can: (rooted) => propOwners(rooted.decls).some((owner) => mutableProps(owner).length > 0),
  apply(rooted, rng) {
    const owners = propOwners(rooted.decls).filter((owner) => mutableProps(owner).length > 0);
    const owner = pick(owners, rng);
    const prop = pick(mutableProps(owner), rng);
    const oldName = prop.name;
    const newName = freshPropName(owner.taken, rng);
    prop.name = newName;
    return `renameProp ${oldName}→${newName}`;
  },
};

const addProp: ValidOp = {
  name: 'addProp',
  can: (rooted) => propOwners(rooted.decls).length > 0,
  apply(rooted, rng) {
    const owner = pick(propOwners(rooted.decls), rng);
    const name = freshPropName(owner.taken, rng);
    owner.props.push({name, optional: chance(rng, 0.3), readonly: chance(rng, 0.2), method: false, shape: randomSmallShape(rng)});
    return `addProp ${name}`;
  },
};

const deleteProp: ValidOp = {
  name: 'deleteProp',
  can: (rooted) => propOwners(rooted.decls).some((owner) => mutableProps(owner).length > 0),
  apply(rooted, rng) {
    const owners = propOwners(rooted.decls).filter((owner) => mutableProps(owner).length > 0);
    const owner = pick(owners, rng);
    const prop = pick(mutableProps(owner), rng);
    owner.props.splice(owner.props.indexOf(prop), 1);
    return `deleteProp ${prop.name}`;
  },
};

const changeLeaf: ValidOp = {
  name: 'changeLeaf',
  can: (rooted) => allSlots(rooted.decls).some((slot) => isLeaf(slot.get()) && slot.get().kind !== 'ref'),
  apply(rooted, rng) {
    // Retype a leaf to a DIFFERENT leaf kind — the structural id of that node
    // changes, so the reconciler must re-scaffold type-derived leaves while
    // carrying type-independent authored ones. Never retarget a `ref` (would
    // dangle); never a no-op (pick a different kind).
    const leaves = allSlots(rooted.decls).filter((slot) => isLeaf(slot.get()) && slot.get().kind !== 'ref');
    const slot = pick(leaves, rng);
    const before = slot.get().kind;
    let next = randomLeaf(rng);
    for (let tries = 0; tries < 5 && next.kind === before; tries++) next = randomLeaf(rng);
    slot.set(next);
    return `changeLeaf ${before}→${next.kind}`;
  },
};

const wrapLeaf: ValidOp = {
  name: 'wrapLeaf',
  can: (rooted) => allSlots(rooted.decls).some((slot) => isLeaf(slot.get())),
  apply(rooted, rng) {
    // Deepen the tree: T → T[] or T | null. Both stay serialisable + disjoint.
    const leaves = allSlots(rooted.decls).filter((slot) => isLeaf(slot.get()));
    const slot = pick(leaves, rng);
    const current = slot.get();
    if (chance(rng, 0.5)) slot.set({kind: 'array', elem: current});
    else slot.set({kind: 'union', members: [current, {kind: 'null'}]});
    return `wrapLeaf ${current.kind}`;
  },
};

const toggleOptional: ValidOp = {
  name: 'toggleOptional',
  can: (rooted) => propOwners(rooted.decls).some((owner) => reflaggableProps(owner).length > 0),
  apply(rooted, rng) {
    const owners = propOwners(rooted.decls).filter((owner) => reflaggableProps(owner).length > 0);
    const owner = pick(owners, rng);
    const prop = pick(reflaggableProps(owner), rng);
    prop.optional = !prop.optional;
    return `toggleOptional ${prop.name}=${prop.optional}`;
  },
};

const addDecl: ValidOp = {
  name: 'addDecl',
  // Needs a leaf slot to hang the new ref on, so the decl is reachable (not noise).
  can: (rooted) => allSlots(rooted.decls).some((slot) => isLeaf(slot.get()) && slot.get().kind !== 'ref'),
  apply(rooted, rng) {
    const name = freshTypeName(rooted.decls, rng);
    const decl: Decl = {
      kind: 'interface',
      name,
      props: [
        {name: 'x', optional: false, readonly: false, method: false, shape: randomLeaf(rng)},
        {name: 'y', optional: chance(rng, 0.4), readonly: false, method: false, shape: randomLeaf(rng)},
      ],
    };
    rooted.decls.push(decl);
    const leaves = allSlots(rooted.decls).filter((slot) => isLeaf(slot.get()) && slot.get().kind !== 'ref');
    pick(leaves, rng).set({kind: 'ref', name});
    return `addDecl ${name}`;
  },
};

// Rename the ROOT and reshape it in ONE step (rename + add a fresh prop). The next
// reconcile sees a NEW var name AND a NEW structural id (the added field changed the
// graph), so neither the name match nor the whole-graph-id match fires — only the
// const-level GRAPH-PARITY matcher can carry the authored tree across. This is the
// rename+reshape case the old id-only matcher lost (it orphaned the const and
// scaffolded an empty twin); it now carries, asserted by the runner's RC oracle.
const renameRootReshaped: ValidOp = {
  name: 'renameRootReshaped',
  can: (rooted) => {
    const root = rooted.decls.find((decl) => decl.name === rooted.rootName);
    return !!root && 'props' in root;
  },
  apply(rooted, rng) {
    const oldName = rooted.rootName;
    const newName = freshTypeName(rooted.decls, rng);
    const root = rooted.decls.find((decl) => decl.name === oldName);
    if (root) root.name = newName;
    renameTypeUses(rooted.decls, oldName, newName);
    rooted.rootName = newName;
    // Reshape by ADDING a prop (never dropping one) so every existing field — and
    // its authored label — must carry; only the genuinely new field is scaffolded.
    let added = '';
    const renamed = rooted.decls.find((decl) => decl.name === newName);
    if (renamed && isMemberDecl(renamed)) {
      const propName = freshPropName(namesInScope(renamed, rooted.decls), rng);
      ownPropsOf(renamed).push({
        name: propName,
        optional: chance(rng, 0.3),
        readonly: false,
        method: false,
        shape: randomSmallShape(rng),
      });
      added = `+${propName}`;
    }
    return `renameRootReshaped ${oldName}→${newName}${added}`;
  },
};

// The default operation set: field edits, `addDecl` (introducing a named sub-const),
// and the TYPE-RENAME ops. Renames carry across the const-level graph-parity matcher;
// the carry — pure rename AND rename + reshape — is asserted on every run by the
// runner's RC oracle.
const VALID_OPS: ValidOp[] = [
  renameProp,
  addProp,
  deleteProp,
  changeLeaf,
  wrapLeaf,
  toggleOptional,
  addDecl,
  renameRoot,
  renameDecl,
  renameRootReshaped,
];

// --- the invalid operations (text-level corruptions) ---------------------------

interface InvalidOp {
  name: string;
  editClass: Exclude<EditClass, 'valid'>;
  // Returns the corrupted source, or null when the anchor it needs isn't present
  // (the switch then falls back to a valid edit).
  corrupt(rooted: RootedType, source: string, rng: () => number): string | null;
}

// Drop the closing quote of a random string literal — unbalanced quote, the
// file no longer parses.
const truncateStringLiteral: InvalidOp = {
  name: 'truncateStringLiteral',
  editClass: 'unparseable',
  corrupt(_rooted, source, rng) {
    const matches = [...source.matchAll(/"[^"\n]*"/g)];
    if (matches.length === 0) return null;
    const match = pick(matches, rng);
    const at = match.index ?? source.indexOf(match[0]);
    // Remove the final closing quote of the chosen literal.
    return source.slice(0, at + match[0].length - 1) + source.slice(at + match[0].length);
  },
};

// Remove one closing brace — unbalanced block, won't parse.
const dropClosingBrace: InvalidOp = {
  name: 'dropClosingBrace',
  editClass: 'unparseable',
  corrupt(_rooted, source, rng) {
    const positions: number[] = [];
    for (let i = 0; i < source.length; i++) if (source[i] === '}') positions.push(i);
    if (positions.length === 0) return null;
    const at = pick(positions, rng);
    return source.slice(0, at) + source.slice(at + 1);
  },
};

// Splice a stray non-TS token into a body — a hard syntax error mid-node.
const garbageToken: InvalidOp = {
  name: 'garbageToken',
  editClass: 'unparseable',
  corrupt(_rooted, source, rng) {
    const positions: number[] = [];
    for (let i = 0; i < source.length; i++) if (source[i] === '{') positions.push(i);
    if (positions.length === 0) return null;
    const at = pick(positions, rng);
    return source.slice(0, at + 1) + ' @#$ ' + source.slice(at + 1);
  },
};

const INVALID_OPS: InvalidOp[] = [truncateStringLiteral, dropClosingBrace, garbageToken];

// --- the switch ----------------------------------------------------------------

// Apply ONE random modification to `rooted`. Valid edits mutate the model in
// place and re-render; an invalid edit (only when `allowInvalid`) leaves the
// model untouched and returns corrupted bytes in `rawSource`.
export function modifyType(rooted: RootedType, rng: () => number, opts: ModifyOptions): ModifyResult {
  if (opts.allowInvalid && chance(rng, 0.3)) {
    const valid = renderRootedSource(rooted);
    // Try corruptions in a random order; the first whose anchor exists wins.
    const order = [...INVALID_OPS].sort(() => rng() - 0.5);
    for (const invalid of order) {
      const corrupted = invalid.corrupt(rooted, valid, rng);
      if (corrupted !== null && corrupted !== valid) {
        return {rooted, rawSource: corrupted, editClass: invalid.editClass, op: invalid.name};
      }
    }
    // fall through to a valid edit if no corruption applied
  }
  const applicable = VALID_OPS.filter((op) => op.can(rooted));
  const op = pick(applicable, rng);
  const label = op.apply(rooted, rng);
  // The edit landed on the members a declaration itself spells; rebuild the
  // flattened view (and any override it invalidated) before anything reads it.
  settleHeritage(rooted.decls);
  return {rooted, rawSource: null, editClass: 'valid', op: label};
}

// --- rooting a generated type --------------------------------------------------

// Wrap a freshly-generated type into a named, exported, OBJECT root the gen CLI
// can target. An object root contributes its own props (rich rename / delete
// surface); any other root rides under a single `value` prop. A couple of plain
// leaf props are always added so there is guaranteed authorable surface even
// when the generated root is a bare scalar.
export function rootGeneratedType(gen: GeneratedType, seq: number, rng: () => number): RootedType {
  const rootName = `Root${seq}`;
  const props: PropShape[] =
    gen.root.kind === 'object'
      ? gen.root.props.slice()
      : [{name: 'value', optional: false, readonly: false, method: false, shape: gen.root}];
  props.push({name: 'lbl0', optional: false, readonly: false, method: false, shape: {kind: 'string'}});
  props.push({name: 'lbl1', optional: chance(rng, 0.5), readonly: false, method: false, shape: {kind: 'number'}});
  const rootDecl: Decl = {kind: 'interface', name: rootName, props};
  return {decls: [...gen.decls, rootDecl], rootName};
}
