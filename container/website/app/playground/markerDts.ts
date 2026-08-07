// Playground shared constant.
//
// This file used to also emit hand-written Monaco editor stubs (loose
// `declare module '@ts-runtypes/core[/…]'` overlays). Those were RETIRED: the
// editor now type-checks user snippets against the SAME real ts-runtypes source
// overlay the WASM resolver uses (fetched as runtypes-sources.json, staged as a
// virtual `node_modules/@ts-runtypes/core/` tree and registered with Monaco in
// PlaygroundStage.client.vue). Feeding the real published types means any import
// is typed faithfully with zero stub drift, so only the root-type name remains
// here. See scripts/website/playground-overlay.mjs (the overlay builder) and
// app/playground/packageSources.ts (the resolver-side injection).

// The root type the user's snippet must define: a TS type `MyType` in type mode,
// or a run-type `const MyType = ...` in builder mode. The engine resolves
// `<factory><MyType>()` (type) or `<factory>(MyType)` (builder).
export const ROOT_TYPE = 'MyType';
