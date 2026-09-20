# Why a pure function's id is a hash of its body

```
<package name>#pf_<hash of the body as it ships>
@mionjs/run-types#pf_Kq3f_xN9pQ2wLd
```

The body that is hashed is the one that SHIPS: every dependency reference is already lowered to
that dependency's own id (`deps.go`, `lowerings`). So computing an id IS producing the cache
entry, and one registration cannot be hashed before the registrations it reaches.

That ordering is the cost of the design. It is paid on purpose, for the three properties below.
Every alternative in the last section drops at least one of them.

## The three properties

### 1. Two bodies that read the same can call different functions

```ts
// file A                                   // file B, byte-identical text
(utl) => () => utl.getPureFn(dep)()         (utl) => () => utl.getPureFn(dep)()
// A: dep -> ./sanitize                     // B: dep -> ./normalize
```

A wrapper whose whole body is `return dep()` is the smallest case, and it is common. Hashing the
text as written collapses both into one entry and ships one body for two call sites, silently.
Hashing the SHIPPED body separates them, because the lowered dep id differs.

### 2. A changed dependency moves every id that reaches it

Take the same wrapper, unchanged, and edit `dep`'s body. `dep`'s id moves, so the wrapper's
shipped body moves, so the wrapper's id moves. That cascade is what keeps a stale bundle honest:

```ts
// packages/run-types/src/runtypes/entryTuple.ts:790, first registration wins, silently
if (utils.hasPureFnByKey(record.key)) return false;
```

Without the cascade the wrapper keeps its id across the edit. A client bundle built before the
edit then meets a server built after it, keeps its own copy of the wrapper (the line above), and
that copy still points at the old `dep` it carries. No miss, no error, the wrong function runs.
With the cascade the server ships a new id, the client has never seen it, and registration wins.

### 3. A stale id is a clean miss, never a different function

Same id implies same body, by construction. Nothing downstream has to verify anything, which is
why `BodyHash` was removed from the entry, the tuple, the wire and the client store: once the id
IS the hash of the code, a second hash of the same code carries nothing. It is also why PFE9004
("two pure functions share an id but have different bodies") is unreachable and was deleted.

The disk cache leans on this directly:

```go
// cachegen/typefunctions/module.go, a cached type entry bakes utl.getPureFn('<id>')
for _, id := range entry.PureFnRefs {
    if !purefnids.Has(id) { return entryRender{}, false }   // body changed, re-walk
}
```

## What the rule deliberately does NOT depend on

Renaming the binding, renaming the export, or moving the file inside its package all leave the id
alone. A file under no named package keeps the hash with an empty package half, which is the same
answer from any directory. `BindingName` rides alongside for diagnostics and for the generated
built-in constant names, and reaches nothing else.

## The one real limitation

Two pure functions that call each other have no answer: each id would have to contain the other.
That is `PFE9015` (`diagnostics/codes_purefn.go:53`), an Error, raised by the `inProgress` guard
in `resolve.go`. Before it existed, an eager cycle recursed forever at materialisation, so this
replaced a runtime hang with a build error, but it does forbid a reasonable thing to write.

If that ever has to change, the shape that keeps all three properties is a reachability fold
instead of a fixed point: hash the own text, plus a map of each dep reference (by the name as
written) to the declaration it resolves to, plus, over the whole reachable set keyed by
declaration, each one's own text hash. Reachability terminates on a cycle; a hash of hashes
cannot. Nobody has asked for mutual recursion yet, so the fixed point stays.

## Alternatives that look like cleanups and are not

Each of these removes the dependency ordering above. Each was considered and dropped for the
counterexample beside it.

1. **The exported name, `@acme/text#slugify`.** Half the registrations have no name to use: an
   inline `inputFrom(order, (o) => o!.userId)` mapper is bound to nothing. A scheme that names
   what it can and hashes the rest is two rules wearing one format, which is what this design
   replaced.

2. **Package, file path, line and column.** Every cosmetic edit moves ids. Insert a blank line at
   the top of a file and every registration below it changes, which republishes the checked-in
   `purefnids/ids.generated.go` and every consumer artifact for a whitespace commit. Today
   horizontal whitespace is normalised out of the hash and formatting moves nothing.

3. **Package, file path, and a name or an ordinal per file.** Formatting-proof, but an ordinal
   shifts when a mapper is added above it, and nothing in the source says so. It also loses
   property 2 and property 3 entirely.

4. **A location for identity, with the body hash carried alongside for integrity.** This restores
   property 3 at the cost of putting `BodyHash` back on the entry, the tuple and the wire, and it
   still loses property 2: the wrapper in section 2 keeps its id when its dependency changes, and
   the integrity hash is only checked where somebody remembers to check it. First-wins
   registration does not.

5. **Hash the body as written rather than as it ships.** Cheaper, needs no ordering, and fails
   section 1 outright.

6. **Hash the own text plus each dependency's import identity, not its hash.** Passes section 1,
   fails section 2, because the import identity does not move when the imported body changes.

7. **Location ids would delete the name to id map.** They would not. `purefnindex` exists mostly
   to hand a consumer the BODY of a pure function it sees only as a `.d.ts`; the consumer computes
   a path from `dist/slug.d.ts` while the publisher computed one from `src/slug.ts`, so the id
   still cannot be derived on the consumer side. The map is needed for bodies either way.
