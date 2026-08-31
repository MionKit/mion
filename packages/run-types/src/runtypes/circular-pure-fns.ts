// Registration module for the circular-reference walker `rt::findCycle`.
//
// The circular-reference guard is a COMPILE-TIME option (`{rejectCircularRefs:
// true}`): only the armed variant of a guarded factory (validate /
// validationErrors / toBinary / jsonEncoder) inlines the guard, and only for a
// cycle-capable type. The armed body calls `rt::findCycle(value, skeleton)`
// where `skeleton` is a small graph BAKED into the factory closure at build time
// (computed by internal/cachegen/typefunctions/circular_skeleton.go). So this
// walker needs NO RunType graph at runtime — the skeleton IS the pruned,
// cycle-capable graph — and it rides the demand-driven built-in pure-fn
// machinery like every other `rt::` body (body-referenced, so a plain unarmed
// type ships neither the walker nor a bundle).
//
// The skeleton shape (mirror of CircularSkeleton.JSLiteral):
//
//   {c: [1|0, …], e: [[{p: [seg, …], t: idx}, …], …]}
//
// Node 0 is the guarded root; c[i] flags a TRACKED node (a circular type whose
// values ride the descent stack). e[i] lists the outgoing circular edges from
// node i — each an access path `p` (segment list) to another tracked node `t`.
// Segment encodings: ["k", name] value[name]; ["a"] iterate array elements;
// ["s"] iterate Set elements; ["mk"]/["mv"] iterate Map keys/values; ["i"]
// iterate own-enumerable values (index signature).
//
// Self-containment: the body is rebuilt via `new Function('utl', code)`, so it
// references no module-level import. It walks ONLY the baked circular edges with
// a descent stack LOCAL to itself (add-on-descent / delete-on-ascent), so DAGs /
// shared refs pass and only a true reference cycle flags — matching
// JSON.stringify's semantics. A per-node "fully-explored" memo (`safe`) keeps it
// O(V+E): a shared value reachable by many paths is walked once, never re-walked
// per path (a diamond DAG would be exponential otherwise).
//
// The stack is a plain ARRAY, not a Set: it holds only the tracked values on the
// CURRENT descent path (short in practice — a tree's height, a short chain), and
// a linear `indexOf` scan of a short array beats Set's hashing (measured
// ~1.3–1.9x faster up to ~depth 100; Set only wins for pathologically deep single
// chains). The delete is always LIFO — delete-on-ascent removes the value this
// frame just pushed — so it's a plain `pop()`, and membership is the only scan.

import {registerPureFnFactory} from './pureFn.ts';

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey[i]`/`mapValue[i]` labels for keyed collections. Mirrors CircularPath
 *  in circular.ts (kept there as the public type). **/
type CircularPath = (string | number)[];

/** The baked circular skeleton passed to `rt::findCycle` (see the module
 *  comment). Kept loose (`any`-ish) on purpose — the pure-fn extractor casts
 *  away annotations, so the shape is documented, not enforced, at runtime. **/
type CircularSkeleton = {c: number[]; e: {p: unknown[][]; t: number}[][]};

/** Runtime shape of the `rt::findCycle` pure fn: walk `value` against its
 *  baked circular skeleton and return the path to the first reference cycle, or
 *  null when acyclic. Called inline from the armed guarded factory bodies. **/
export type FindCycleFn = (value: unknown, skeleton: CircularSkeleton) => CircularPath | null;

/** Per-call walk state, allocated fresh on every findCycle invocation and passed
 *  down the recursion — NEVER closure-shared. Isolation matters twice: reading
 *  `val[key]` can run user code (a getter / Proxy trap) that synchronously
 *  invokes ANOTHER armed factory mid-walk, and closure-held state would let that
 *  inner call clobber the outer walk (missed cycle → the real validator body
 *  recurses forever); and closure-held state would also retain the last walked
 *  object graph after the call returns, pinning it from GC. `c`/`e` mirror the
 *  skeleton; `stack` is the descent stack, `path` the access trail, `safe` the
 *  per-node acyclic memo. **/
type CircularWalkState = {
  c: number[];
  e: CircularSkeleton['e'];
  stack: unknown[];
  path: CircularPath;
  safe: Set<unknown>[];
};

registerPureFnFactory('rt::findCycle', function () {
  // The recursive `nav` / `dfs` closures are created ONCE here (factory closure,
  // at materialisation) — but ALL mutable state rides the per-call `st` argument
  // (CircularWalkState above), so invocations are fully isolated: a synchronous
  // re-entrant call (getter / Proxy trap invoking another armed factory) gets its
  // own state, and the walked graph is GC-able the moment findCycle returns.

  // Navigate one edge path from `val`, branching at iteration segments; at the
  // path end, descend into the reached value as tracked node `toNode`.
  const nav = (val: unknown, segs: unknown[][], si: number, toNode: number, st: CircularWalkState): boolean => {
    if (si === segs.length) return dfs(val, toNode, st);
    const seg = segs[si];
    const kind = seg[0];
    if (kind === 'k') {
      const child = val === null || typeof val !== 'object' ? undefined : (val as any)[seg[1] as any];
      if (child === undefined || child === null) return false;
      st.path.push(seg[1] as string | number);
      const hit = nav(child, segs, si + 1, toNode, st);
      if (hit) return true;
      st.path.pop();
      return false;
    }
    if (kind === 'a') {
      if (!Array.isArray(val)) return false;
      for (let i = 0; i < val.length; i++) {
        const el = val[i];
        if (el === undefined || el === null) continue;
        st.path.push(i);
        if (nav(el, segs, si + 1, toNode, st)) return true;
        st.path.pop();
      }
      return false;
    }
    if (kind === 'i') {
      if (val === null || typeof val !== 'object') return false;
      for (const key of Object.keys(val as object)) {
        const pv = (val as any)[key];
        if (pv === undefined || pv === null) continue;
        st.path.push(key);
        if (nav(pv, segs, si + 1, toNode, st)) return true;
        st.path.pop();
      }
      return false;
    }
    if (kind === 's') {
      if (!(val instanceof Set)) return false;
      let index = 0;
      for (const el of val) {
        if (el !== undefined && el !== null) {
          st.path.push(index);
          if (nav(el, segs, si + 1, toNode, st)) return true;
          st.path.pop();
        }
        index++;
      }
      return false;
    }
    if (kind === 'mk' || kind === 'mv') {
      if (!(val instanceof Map)) return false;
      let index = 0;
      for (const entry of val) {
        const member = kind === 'mk' ? entry[0] : entry[1];
        if (member !== undefined && member !== null) {
          st.path.push((kind === 'mk' ? 'mapKey[' : 'mapValue[') + index + ']');
          if (nav(member, segs, si + 1, toNode, st)) return true;
          st.path.pop();
        }
        index++;
      }
      return false;
    }
    return false;
  };

  // Push a tracked value on the descent stack (cycle-check first), follow its
  // circular edges, then pop. Non-tracked nodes (the root when its type isn't
  // itself circular) are traversed without stacking.
  const dfs = (val: unknown, node: number, st: CircularWalkState): boolean => {
    if (val === null || typeof val !== 'object') return false;
    // Already proven acyclic as this node (on an earlier path) → skip. Sound
    // because a cycle THROUGH `val` is caught during `val`'s own descent (it sits
    // on the stack then), so an acyclic subtree is path-independent.
    const known = st.safe[node];
    if (known !== undefined && known.has(val)) return false;
    const isTracked = !!st.c[node];
    if (isTracked) {
      if (st.stack.indexOf(val) !== -1) return true;
      st.stack.push(val);
    }
    const outgoing = st.e[node];
    for (let i = 0; i < outgoing.length; i++) {
      if (nav(val, outgoing[i].p, 0, outgoing[i].t, st)) return true;
    }
    // LIFO: this frame pushed `val` on entry, so pop removes exactly it.
    if (isTracked) st.stack.pop();
    // Clean subtree → memoize so a shared / DAG re-arrival skips it.
    let bucket = st.safe[node];
    if (bucket === undefined) {
      bucket = new Set();
      st.safe[node] = bucket;
    }
    bucket.add(val);
    return false;
  };

  return function findCycle(value: unknown, skeleton: CircularSkeleton): CircularPath | null {
    if (value === null || typeof value !== 'object' || !skeleton) return null;
    const st: CircularWalkState = {c: skeleton.c, e: skeleton.e, stack: [], path: [], safe: []};
    return dfs(value, 0, st) ? st.path.slice() : null;
  };
});
