# Why a pure function's id is a hash of its body

Read before changing what a pure fn id is made of.

- Shape: `<package name>#pf_<hash of the body as it ships>`, e.g. `@mionjs/run-types#pf_Kq3f_xN9pQ2wLd`.
- Hashed body = the one that SHIPS: every dep reference already lowered to that dep's own id (`deps.go`, `lowerings`).
- So computing an id IS producing the cache entry.
- Cost: a registration cannot be hashed before the registrations it reaches (dependency ordering).
- Paid on purpose for the three properties below. Every alternative in the last section drops at least one.

## The three properties

### 1. Two bodies that read the same can call different functions

- File A + file B, byte-identical: `(utl) => () => utl.getPureFn(dep)()`. A's `dep` → `./sanitize`, B's → `./normalize`.
- Smallest case: a wrapper whose whole body is `return dep()`. Common.
- Hash the text as written → both collapse into one entry, one body ships for two call sites, silently.
- Hash the SHIPPED body → separate entries, because the lowered dep id differs.

### 2. A changed dependency moves every id that reaches it

- Edit `dep`'s body, wrapper unchanged → `dep`'s id moves → wrapper's shipped body moves → wrapper's id moves.
- That cascade keeps a stale bundle safe. Registration is first-wins, silently:
  `if (utils.hasPureFnByKey(record.key)) return false;`
  (`registerPureFnTuple` in `packages/run-types/src/runtypes/entryTuple.ts`).
- No cascade → wrapper keeps its id across the edit. Client bundle built before meets server built after.
- Client keeps its own wrapper copy (line above), still pointing at the old `dep`. No miss, no error, wrong fn runs.
- With the cascade: server ships a new id, client has never seen it, registration wins.

### 3. A stale id is a clean miss, never a different function

- Same id ⇒ same body, by construction. Nothing downstream has to verify anything.
- So no second body hash on the entry, tuple, wire or client store.
  Once the id IS the code hash, a second hash of the same code carries nothing.
- So "two pure fns share an id but have different bodies" cannot happen. No diagnostic exists for it.
- Disk cache relies on it: a cached type entry bakes `utl.getPureFn('<id>')`.
- `cachegen/typefunctions/module.go`: an `entry.PureFnRefs` id failing `purefnids.Has(id)` = body changed → re-walk.

## What the rule deliberately does NOT depend on

- Renaming the binding, renaming the export, moving the file inside its package: id unchanged.
- File under no named package: same hash, empty package half. Same answer from any directory.
- `BindingName` rides alongside, only for diagnostics + generated built-in constant names. Reaches nothing else.

## The one real limitation

- Two pure fns that call each other have no answer: each id would have to contain the other.
- = `purefn-dependency-cycle` (`diagnostics/codes_purefn.go`), an Error.
  Raised by the `inProgress` guard in `resolve.go`.
- It replaced a runtime hang (eager cycle recursed forever at materialisation), but forbids a reasonable thing to write.
- Must change one day? Shape keeping all three properties = reachability fold, not fixed point. Hash:
  - own text,
  - + map of each dep reference (by the name as written) → declaration it resolves to,
  - + over the whole reachable set keyed by declaration, each one's own text hash.
- Reachability terminates on a cycle; a hash of hashes cannot.
- Nobody has asked for mutual recursion yet → fixed point stays.

## ⚠️ Alternatives that look like cleanups and are not

Each removes the dependency ordering above. Each was dropped for the counterexample beside it.

1. **Exported name, `@acme/text#slugify`.**
   - Half the registrations have no name: an inline `inputFrom(order, (o) => o!.userId)` mapper is bound to nothing.
   - Name what you can + hash the rest = two rules wearing one format, which is what this design replaced.
2. **Package, file path, line and column.**
   - Every cosmetic edit moves ids. A blank line at the top of a file changes every registration below it.
   - That republishes checked-in `purefnids/ids.generated.go` + every consumer artifact for a whitespace commit.
   - Today horizontal whitespace is normalised out of the hash; formatting moves nothing.
3. **Package, file path, and a name or an ordinal per file.**
   - Formatting-proof, but an ordinal shifts when a mapper is added above it, and nothing in the source says so.
   - Loses property 2 and property 3 entirely.
4. **A location for identity, body hash carried alongside for integrity.**
   - Restores property 3, but puts a body hash back on the entry, the tuple and the wire.
   - Still loses property 2: section 2's wrapper keeps its id when its dependency changes.
   - Integrity hash checked only where somebody remembers to check it. First-wins registration does not.
5. **Hash the body as written, not as it ships.** Cheaper, needs no ordering, fails section 1 outright.
6. **Hash own text + each dep's import identity, not its hash.**
   - Passes section 1, fails section 2: import identity does not move when the imported body changes.
7. **"Location ids would delete the name → id map."** They would not.
   - `purefnindex` exists mostly to hand a consumer the BODY of a pure fn it sees only as a `.d.ts`.
   - Consumer computes a path from `dist/slug.d.ts`, publisher from `src/slug.ts`.
     → the id still cannot be derived on the consumer side.
   - The map is needed for bodies either way.
