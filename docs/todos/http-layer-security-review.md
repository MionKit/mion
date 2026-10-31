---
type: chore
spec: guidelines
status: ready
created: 2026-10-31
---

# HTTP-layer security review of mionSecurity and the platform adapters

## Intent

`mionSecurity` covers CORS, CSRF and a few response headers. Once its interface settles, review mion against
guides written for the HTTP layer, not app logic, so each gap lands in the layer that can fix it. The OWASP
Secure Coding checklist is mostly app-level and does not fit.

## Direction

The implementer plans the review. Suggested sources:

- OWASP ASVS 5: chapter V3 (Web Frontend Security: CORS, CSRF, origin checks, response headers, cookies) and
  chapter V4 (API and Web Service: methods, content types, HTTP message handling).
- PortSwigger Web Security Academy attack classes: request smuggling, Host header attacks, web cache poisoning,
  HTTP/2 issues, CORS misconfiguration.
- OWASP API Security Top 10 (2023), mainly unrestricted resource consumption.
- OWASP cheat sheets: CSRF Prevention, HTTP Headers, REST Security. RFC 9110 / 9112 to settle protocol questions.

Sort every finding into one of two layers:

1. **What only the adapters or the HTTP server can do**: body framing and smuggling, timeouts, header and URL
   size, slow clients, connection handling. The adapters live in `packages/platform-*/src`; shared code the
   adapters repeat belongs in the router (`packages/rpc-router/src`).
2. **What `mionSecurity` can take on as opt-in policy**: rate limits, more response headers, anything an app
   might turn on. It lives in `packages/rpc-router/src/middlewares/security.ts`.

Fix each finding in its layer with its own test. A finding outside both (a proxy or deployment concern) goes in
the docs as advice, not in code.

## Docs

- `container/website/content/01.rpc/03.middlewares/03.security.md`: existing section "What the Middleware
  Protects" for any new check or advice; a new section only if the review adds a new kind of protection.
- The platform pages under `container/website/content/01.rpc/06.platforms/` for any limit an adapter adds.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every requirement of ASVS V3 and V4 and every attack class above is checked, with a short written verdict per
  item (covered, fixed here, or not mion's layer and why).
- Each fix sits in the right layer with its own test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
