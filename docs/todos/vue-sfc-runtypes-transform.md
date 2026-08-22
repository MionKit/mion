# Vue SFC `<script>` blocks are never type-transformed (the other half of R28)

**Status:** todo — **upstream-blocked on a `@ts-runtypes/devtools` option, but the engine itself can
already do it** (measured, see Evidence). Split out of
[vite-plugin-ssr-middleware-mode.md](../done/vite-plugin-ssr-middleware-mode.md), whose fix plan
carried it as "re-add the `.vue?vue&type=script` transform (R28)". The middleware/SSR half shipped;
this half did not, because nothing in mion can reach the resolver that would have to do it.
**Created:** 2026-08-22

## Problem

Typed mion code written inside a `.vue` SFC (`route(...)`, `createValidate*`, any marker call in a
`<script>` block) is **silently not transformed**: no diagnostic, no build failure — the marker just
never gets its compiled fns, and the failure surfaces later as a `MissingRtFnsError` or a route that
never validates. The pre-migration plugin handled SFCs (it parsed `Component.vue?vue&type=script`
ids and ran deepkit's per-file text transform against a synthetic `.ts` name); the migration dropped
it because the new engine is not a per-file text transform.

## Evidence

**1. The plugin gate.** `@ts-runtypes/devtools@0.12.1`'s transform hook rejects anything that is not
a plain TS/JS id, before any of mion's code could intervene
(`node_modules/@ts-runtypes/devtools/dist/unplugin.js:249-270`):

```js
async transform(code, id) {
    if (!resolver) return null;
    if (!/\.[mc]?[jt]sx?$/.test(id)) return null;          // ← ids with a ?vue query fall out here
    const rel = path.relative(cwdAbs || process.cwd(), id);
    …
    catch (error) {
        if (!inSiteSet && error.message.includes('source file not in program')) return null;  // ← silent
    }
}
```

There is no `include`/`filter`/`extensions` option to widen it: `PluginOptions`
(`dist/unplugin.d.ts:15-50`) has no such field. mion's wrapper cannot pre-empt it either — the
resolver instance lives in that plugin's closure, so mion has no handle to transform through.

**2. The resolver itself has no such limitation — this is the part that changes the picture.**
Probed directly against the 0.12.1 binary (temp project, tsconfig `include: ["**/*.ts"]`, one real
marker call). A path that exists in NO tsconfig program and on NO disk transforms correctly once its
source is registered:

```
RAW setSources {'Comp.vue.ts': code} → {"ok":true}
transform(['Comp.vue.ts'])           → sites: [{file:"Comp.vue.ts", pos:144, id:"M8U0CGo", fnId:"nPZ", …}]
                                     → code: "import {__rt_nPZ_M8U0CGo} from 'rtmod:/nPZ_M8U0CGo.js';
                                              … createValidateFn<User>(undefined, undefined, __rt_nPZ_M8U0CGo);"
```

i.e. the injection is complete and correct, with a real source map. So "Vue SFCs cannot work with a
whole-program resolver" is **false**; only the plugin's id gate and its lack of a setSources step for
virtual ids stand in the way.

**3. A client-side bug sits on the same path.** `ResolverClient.setSources()` throws
`Cannot read properties of undefined (reading 'slice')` on a response the server answered `{"ok":true}`
to — the raw `send({op:'setSources', …})` works. Worth reporting alongside the option request, since
any SFC support would call exactly this method.

## Fix plan

Preferred (upstream, small): ask `@ts-runtypes/devtools` for a transform-id filter plus virtual-source
handling — accept an id whose _base_ path is TS-like (`Comp.vue?vue&type=script&lang.ts`), map it to a
stable virtual path, `setSources` the incoming code under that path, and transform it. Everything
under it already works. Fix the `setSources` client bug in the same pass.

Fallback (in mion, only if upstream declines): mion's plugin runs its OWN `ResolverClient` for SFC
ids and registers their script blocks with `setSources`. Costs a second resolver process (a second
program scan and its memory) and needs the `rtmod:` import specifier the transform emits to resolve
against the same generated tree the main plugin writes. **That is an architecture call for the
maintainer, not a mechanical follow-up** — hence this spec rather than a quiet implementation.

Either way the acceptance test is the same: a `.vue` SFC whose `<script>` calls `route()`/`createValidate*`
compiles, validates and serializes exactly like the `.ts` equivalent, and a regression makes the build
fail rather than ship an untransformed marker.

## Interim

Nuxt/Vue users must keep typed mion code (routes, `createValidate*`, anything the resolver rewrites)
in `.ts` files and import it into their SFCs. That is the normal layout for a mion backend anyway —
routes live in their own modules — so the practical blast radius is marker calls written inline in a
component. Until this lands, such a call fails at runtime, not at build time, which is the part that
most needs fixing.
