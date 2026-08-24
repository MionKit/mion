// A type this app reflects through an ERASED import, so Turbopack has no edge
// from the reflecting module back to here. Editing it is what the two-phase
// build in build-all.mjs exercises: without the loader declaring its type
// dependencies, Turbopack can serve a cached rewrite pointing at a generated
// module the edit just pruned.
export interface StaleProbe {
  id: number;
  label: string;
}
