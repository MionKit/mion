---
type: feature
spec: guidelines
status: ready
created: 2026-09-03
---

# A compact-JSON wire mode, and compact charts under the server benchmarks

## Intent

Show what compact JSON buys on the wire. Under each server benchmark section on the rpc
pages (light validation, heavy validation, payload sizes; hello world has no body) a
small second chart compares the same mion lane over plain JSON and over compact JSON:
requests per second and bytes on the wire. Compact drops every key name from an
object (`{a, b}` → `[v.a, v.b]`), so the win shows on real-world objects with many
properties and repeats; on flat arrays of scalars it is zero.

## Direction

The implementer plans the details. What the investigation pinned:

- **The RPC layer has no compact mode.** `SerializerModes` is `json | binary |
  stringifyJson | optimistic` (`packages/core/src/types/general.types.ts:13-22`); the
  router option is `serializer` (`packages/router/src/types/general.ts:38-46`), the
  client's at `packages/client/src/types.ts:90-91`; only `application/json` and
  `application/octet-stream` exist (`packages/core/src/constants.ts:19-22`). Compact is
  a RunTypes strategy: `JsonEncoderStrategy` / `JsonDecoderStrategy` `'compact'`
  (`packages/run-types/src/createRTFunctions.ts:355-378`), compiled families `cj` /
  `cjr` (lines 735-736). A new serializer mode wires those families in, with its own
  content type or a negotiation header. The wire is shape-coupled (both ends share the
  type), which mion's client already guarantees.
- **Document the strategy first.** The Encoder Strategies table on
  `container/website/content/02.runtypes/02.guide/05.json-serialization.md:39-43` and
  its example `packages/examples/src/guide/json-strategies.ts` list `clone`, `mutate`
  and `direct` only; `compact` is shipped, tested and benchmarked
  (`packages/run-types/test/suites/serialization/CompactUnionEncoding.test.ts`).
- **The harness.** `container/mion-bench/harness/run.mjs` sends a fixed
  `application/json` body (`content-type` at 97, 142, 222) and `verify()` reads a keyed
  response by route id (111-123). A compact lane needs a compact body from
  `shared/suites.mjs` / `shared/payloads.mjs`, the header switched, and the gate taught
  to decode a positional response, or the lane fails the correctness check by design.
  The mion app (`apps/mion/server-*.ts`) passes no router options today; a compact
  entry point per adapter, or a `MION_BENCH_WIRE` knob (registered in
  `scripts/lib/env.mjs`), selects the mode.
- **The payload sweep needs a new shape.** `buildUserOfSize`
  (`shared/payloads.mjs:75-83`) pads one user by growing `tags: string[]`, where compact
  saves nothing. A builder that scales by repeating `User` objects (`User[]`) is what
  shows the win; the runtypes serialization data already measures 40 to 60 percent
  fewer bytes on the real-world objects and 0 on scalar arrays
  (`container/website/public/bench-data/serialization/`, `REALWORLD.*` vs `ARRAYS.array`).
- **The data and the page.** `gen-servers-docs.mjs` (row shape at 37-53) has no
  bytes-on-the-wire field; the harness only knows request `actualBytes`. Add request +
  response bytes to the row, a `wire` tag (`json` / `compact`) or a
  `servers-<suite>-compact` dataset, and a `bytes` metric to `ServerBenchBars.vue`'s
  registry (`:28-34`). The small chart under each section is a second
  `:server-bench-bars` call, or a `compare` prop, whichever keeps the gate simple.
- Marker-API tests follow the coverage rule in `ts-go-runtypes/CLAUDE.md` if the marker
  surface is touched.

## Done when

- `compact` is a documented, tested router and client serializer mode.
- The Encoder Strategies guide lists all four strategies.
- Every rpc benchmark page with a body shows the plain-versus-compact chart under each
  section, the payload sweep uses an object-repeating body, and every compact lane
  passes the harness's correctness gate.
