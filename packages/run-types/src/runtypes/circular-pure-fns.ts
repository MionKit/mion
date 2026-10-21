// Registration module for the circular-reference walker `findCycle`. The guard is a COMPILE-TIME option
// (`{rejectCircularRefs: true}`): only the armed variant of a guarded factory inlines it, for a cycle-capable type, and the
// `skeleton` it passes is BAKED into the factory closure at build time (internal/cachegen/typefunctions/circular_skeleton.go).
// So the walker needs NO RunType graph at runtime, and an unarmed type ships neither the walker nor a bundle.
// Skeleton shape (mirror of CircularSkeleton.JSLiteral): `{c: [1|0, …], e: [[{p: [seg, …], t: idx}, …], …]}`; node 0 is the
// guarded root, c[i] flags a TRACKED node (values ride the descent stack), e[i] lists its outgoing circular edges, each an
// access path `p` to another tracked node `t`. Segments: ["k", name] value[name]; ["a"] array elements; ["s"] Set elements;
// ["mk"]/["mv"] Map keys/values; ["i"] own-enumerable values (index signature).
// The body is rebuilt via `new Function('utl', code)`, so it references no module-level import.
// It walks ONLY the baked edges with a LOCAL descent stack, so DAGs and shared refs pass and only a true cycle flags, matching JSON.stringify.
// A per-node "fully-explored" memo (`safe`) keeps it O(V+E); a diamond DAG would be exponential otherwise.
// The stack is a plain ARRAY, not a Set: it holds one descent path (short in practice), and a linear `indexOf` beat Set's hashing
// ~1.3–1.9x up to ~depth 100, Set winning only for pathologically deep single chains.

import {registerPureFnFactory} from './pureFn.ts';
import {findCycleId} from './pure-fn-ids.generated.ts';

/** Object keys and array/tuple indices, plus `mapKey[i]`/`mapValue[i]` labels; mirrors CircularPath in circular.ts, the public copy. **/
type CircularPath = (string | number)[];

/** The baked skeleton (see the module comment), kept loose on purpose: the pure-fn extractor casts annotations away, so nothing is enforced. **/
type CircularSkeleton = {c: number[]; e: {p: unknown[][]; t: number}[][]};

/** Returns the path to the first reference cycle, or null when acyclic; called inline from the armed guarded factory bodies. **/
export type FindCycleFn = (value: unknown, skeleton: CircularSkeleton) => CircularPath | null;

/** Allocated fresh per call, NEVER closure-shared: reading `val[key]` can run user code (getter / Proxy trap) that re-enters another armed factory mid-walk. **/
// Shared state would let that inner call clobber the outer walk (missed cycle → the real validator body recurses forever), and would pin the last walked graph from GC.
// `c`/`e` mirror the skeleton; `stack` is the descent stack, `path` the access trail, `safe` the per-node acyclic memo.
type CircularWalkState = {
  c: number[];
  e: CircularSkeleton['e'];
  stack: unknown[];
  path: CircularPath;
  safe: Set<unknown>[];
};

export const findCycle = registerPureFnFactory(function () {
  // The `nav` / `dfs` closures are created ONCE at materialisation, but ALL mutable state rides the per-call `st`, so
  // invocations are fully isolated and the walked graph is GC-able the moment findCycle returns.

  // Follow one edge path from `val`, branching at iteration segments, then descend into the reached value as tracked node `toNode`.
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

  // Non-tracked nodes (the root, when its own type isn't circular) are traversed without stacking.
  const dfs = (val: unknown, node: number, st: CircularWalkState): boolean => {
    if (val === null || typeof val !== 'object') return false;
    // Sound to skip: a cycle THROUGH `val` is caught during `val`'s own descent, so an acyclic subtree is path-independent.
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
}, findCycleId);
