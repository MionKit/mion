---
type: feature
spec: guidelines
status: ready
created: 2026-09-18
---

# A pure function's id should take the name it is published under

## Intent

A pure function's id is `<package>/<path>#<name>`, and the name half comes from ONE place
today: the identifier a `const` / `let` / `var` declaration binds the registrar call to
(`bindingNameOf` in `ts-go-runtypes/internal/cachegen/purefunctions/id.go`). Anything in another
position falls back to `CodeHash(code)`, a hash of the body.

That leaves the PUBLISHED name on the floor. Probed against the current binary:

```ts
const inner = registerPureFn((n: number): number => n * 2);
export {inner as publicName};
// id: @acme/names/src/a#inner            ← the LOCAL name, not the one consumers import

export const direct = registerPureFn((n: number): number => n * 3);
// id: @acme/names/src/a#direct           ← fine
```

The hash is the fragile one. It moves on every body edit, so a helper whose logic is tuned
gets a new identity while the name everyone imports it by never changed. A name moves only
when someone renames it, which is deliberate and visible in the diff. Prefer the most public
name available and keep the hash for the case that genuinely has none.

## The function's own name is not a name

A named function expression carries a label that is in scope only inside its own body:

```ts
export const double = registerPureFn(function namedExpr(n: number): number { return n * 2; });
```

`namedExpr` is invisible to every other file, and it has to be: a pure fn must be written
inline, with no handle anything else can reach (`PFN002`), so the only identifier a consumer
ever holds is the binding or the export. The build ignores it today and must keep ignoring it.
Pin that rather than leave it to be rediscovered.

## Direction

The implementer plans the details. These are the constraints.

- **Resolve the name half down a ladder, most public first.** The exported name (the final one,
  so `export {inner as publicName}` yields `publicName`), then the local binding, then the body
  hash. Three rungs, no more: the current rule is the middle one, so this adds the rung above
  it and leaves the bottom one alone. The bottom rung is not a fallback nobody reaches: see the
  `inputFrom` section below.
- **Only the declaring file's own exports count.** An id says where a function LIVES. Following
  a re-export (`export {x as z} from './fns'` in a barrel) would make one file's id depend on
  another file's text, so adding or renaming a barrel entry would silently move it. A re-export
  elsewhere must leave the id alone.
- **The id stays a pure function of its own registration.** Not of build order, not of another
  file, not of how many other registrations the file holds. Any collision rule has to hold that
  line, which is what makes the collision question below a real design decision rather than a
  detail.
- **Settle what a name-half collision does.** Two registrations in one file can now claim one
  name (two block-scoped `const slugify`s, or a local name equal to another's exported name).
  Today that is `PFE9004`, a build error naming both sites. Appending the body hash to both
  sides disambiguates but breaks the rule above: adding a second same-named registration would
  move the FIRST one's id. Appending it to the later one only trades that for order dependence.
  Refusing the collision (what happens today) keeps every id stable and asks the author to
  rename, which is a one-line fix in the file that caused it. Pick one, write down why, and say
  what is left for `PFE9004` to catch: cross-file collisions are impossible by construction, so
  if collisions are auto-disambiguated the code may have nothing left to fire on.
- **Decide `export default`.** A default export has no name of its own. `default` is the honest
  spelling; the file already names the module, so `<path>#default` reads fine. Say so or pick
  something better, but do not leave it falling through to the hash by accident.
- **The rule must read the same off a `.d.ts`.** A published consumer resolves an id from the
  declaration file, and `IDFor` is asked for both. tsc emits the export statements into the
  `.d.ts`, so the ladder should hold, but it is exactly the kind of thing that holds until it
  does not: cover it.

## The hash lane stays, and `inputFrom` is why

Most of mion's batch mappers are written straight into a route call and have no name anywhere:

```ts
routes.orders.getById(inputFrom(order, (o) => o!.userId).asArg())
```

Nothing on the ladder applies to that mapper. It is not exported, it is not bound to a
constant, and its function expression has no name, so it keeps its body hash and this refactor
must leave it exactly as it is. Do not invent a name for it from the surroundings (the route
id, the parameter position, the batch it sits in): each of those makes the id depend on code
the mapper does not own, so moving the call or reordering the batch would move the mapper's
identity. A body hash depends on the mapper alone, which is the right answer when the author
gave it no name.

It costs nothing here because both ends of a batch regenerate together: the server's batch
table is compiled from the client's own source, so an edited mapper body changes the id in the
table and in the client bundle in the same build. The fragility the ladder is fixing is the
NAMED helper that a consumer imports, not this.

A mapper an author does want to pin can have a name — `const toUserId = inputFrom(...)` already
takes the binding rung today — so the two lanes stay available side by side.

## What it costs

Every affected id changes, so this is breaking in the same way the id rule itself was. The
generated built-in id tables regenerate, a mion app's batch table is rebuilt from its client,
and both ends of any build move together, so it is a rebuild rather than a runtime break.
Worth landing before the ids reach a published release, not after.

## Tests

- Go, in `purefunctions`: one case per rung of the ladder (exported-as name, plain export, local
  binding, genuinely anonymous), one pinning that a named function expression takes the rung
  below it rather than its own label, the collision decision, `export default`, a barrel
  re-export leaving the id untouched, and the `.d.ts` / source agreement the existing id tests
  already check for the path half.
- The two seeded sweeps in `fuzz_ids_test.go` get a draw shape that produces colliding names, so
  whatever the collision rule is, injectivity is still proven rather than assumed.
- JS, in `packages/devtools/test`: a rewritten call site carries the exported name, and a
  consumer importing that id resolves the same entry.

## Done when

- The name half comes from the exported name where there is one, and a function expression's own
  label still never reaches an id.
- A barrel re-export cannot move an id, and the collision rule is written down and tested.
- The built-in id tables and the fixtures regenerate clean, and the codegen drift check
  (`pnpm miondevx core codegen all --check`) passes.
