---
type: feature
spec: guidelines
status: maybe
created: 2026-10-03
---

# A types-only API package, published for clients

## Intent

A mion API built with `mion compile` already writes a `.d.ts` whose API type names the server build version
(`ApiBuildVersion<"…">`), and a client built from it checks its own ids against that version (MET012, MET013).
Today a client gets those types by installing the WHOLE server package, source and handlers included.

An API should be able to publish a separate, types-only package for its clients: everything a client build needs,
and nothing of the server's code. It plays the role an OpenAPI spec plays for other stacks, for TypeScript clients
built with mion.

| | Types-only package | OpenAPI spec |
| --- | --- | --- |
| Who can read it | TypeScript clients built with mion | Any language or tool |
| Validation | The client compiles the same validators the server runs, from the same types | Each tool builds its own from the schema, so they can differ |
| Drift check | The build fails on a mismatch (MET012); the version is also checked at runtime | None built in |
| Version | A hash of the route ids, set by the build | Written by hand |

The closer twin of SERVING a spec is the fetch road (`client: {routes: 'fetch'}`), where the server sends its own
route metadata at runtime and no package is needed. This todo is about the build-time road.

## Direction

What the package must carry for a client to build and run against it, as found while building the
`container/pre-publish-e2e/mion-api-types/` lane (which installs the full package today):

- **The API's `.d.ts`**, as `mion compile` writes it: the routes, the middlewares and the build version.
- **The `mion-pure-fns/` artifact**, whenever the API registers overrides or pure fns its route types use.
  Without it the client computes other ids (MET012) or cannot find a body (PFE9016).
- **The server manifest** (`.mion/api/manifest.json`), so `mion api-check` works in the client's CI.
- **Peer dependencies** on `@mionjs/router`, `@mionjs/core` and `@mionjs/run-types`, plus every library whose types
  the routes name: the `.d.ts` refers to their types (`import("@mionjs/router").PublicRoute<…>`).
- **No server JavaScript.** A client only does `import type {api} from '…'`.

**Built-by-mion marker.** The package carries a marker file written by `mion compile` (with the compiler version
and the build version). A client refuses a types-only package without it, with one clear error naming the package,
instead of a scatter of MKR016 / MET012 / PFE9016 findings from a `.d.ts` some other tool wrote. Plain server and
fullstack builds are unaffected: only the types-only road needs the marker.

Trim the declarations: every type in the generated `.d.ts` that no public route or middleware reaches is removed.
Server-only helpers, internal classes and anything a handler uses but does not take or return must not ship.
What stays is the closure of the public API type (each route's params, return and headers, each middleware's), so
the trimmed file still type-checks on its own and gives the client the same ids.

Constraints already known, which the implementer must plan around:

- Both sides must run the same mion compiler version; override rows of another version are skipped (PFE9017).
- Plain `tsc` writes a TS `private` member as `private name;` with its type erased, and a client reading such a class
  fails its build (MKR016). `mion compile` writes those members as `protected` with their type, so a package it built
  gives the client the server's ids.
- Generated code can change without its id changing (the text in `Symbol('x')`, a lost `@nonEnumerable`
  tag); the version check cannot see it. The open todo about using published artifacts as they are covers it.

Open questions for the implementer: whether this is a `mion compile` flag or its own command, how the package's
`package.json` is produced, and how a monorepo keeps the server and its types package on one version. The
implementer plans the details.

## Docs

New section on `container/website/content/01.rpc/07.devtools/04.cli.md`, after "Building a Client From Published
API Types": publishing a types-only package, with the comparison table above.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- One command builds a types-only package from a mion API: the trimmed `.d.ts`, the pure-fn artifact when there
  is one, the manifest, the built-by-mion marker, and a `package.json` with the peer dependencies.
- A client build fails with one error on a types-only package that has no marker, and a test pins it.
- The trimmed `.d.ts` holds no type that no public route or middleware reaches, and a test pins that.
- A pre-publish e2e lane packs it, builds a client against it with the Vite preset and with `mion compile`
  (bundling and fetching), and runs the client against the real server.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
