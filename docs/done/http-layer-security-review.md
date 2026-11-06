---
type: chore
spec: guidelines
status: done
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

## Plan (approved 2026-11-06, automatic mode)

Probe every adapter with raw-socket requests (smuggling shapes, HEAD, duplicate headers, oversized heads), read
`mionSecurity` and the adapters against ASVS 5 V3 + V4 and the listed attack classes, fix each gap in its layer with
its own test, and record a verdict per item below. Proxy and deployment concerns go into a new "What Your Server or
Proxy Handles" table on the security page.

## What shipped

- **platform-uws**: refuses a request whose framing uWS reads loosely (a repeated or empty `content-length`, a
  `transfer-encoding` other than `chunked`) with a 400 `invalid-request-framing` and closes the connection; a HEAD
  answer has no body (`endWithoutBody`); a handler's `transfer-encoding` header is dropped.
- **platform-node, platform-gcloud, platform-aws**: a handler's `transfer-encoding` header is dropped, so an answer
  never carries it next to the length the adapter or the gateway sets.
- **mionSecurity**: `Vary` lists every request header the chain declares in a headers parameter (plus `Origin` with CORS) on real answers, so a
  shared cache keys on them. A preflight keeps `Vary: Origin`.
- **rpc-client**: a query GETs only when its URL fits 2048 characters (was 4096), leaving half of uws' 4 KB head to headers and cookies.
- **router**: the nesting-limit error names the limit (it printed the template text).
- **Docs**: security page (cache keys row, "What Your Server or Proxy Handles" table), Node timeouts, uWS framing.

## Verdicts

Probed over raw sockets on node, bun and uws; the serverless adapters get bytes already framed by their platform.

### ASVS 5 V3 Web Frontend Security

| Item | Verdict |
| --- | --- |
| 3.1.1 browser features documented | Covered: security page states what the middleware does and does not do. |
| 3.2.1 content rendered in the wrong context | Covered: JSON-only answers with charset; with mionSecurity, `nosniff`. |
| 3.2.2 safe text rendering, 3.2.3 DOM clobbering | Not mion's layer: client page code. |
| 3.3.1-3.3.5 cookie flags, prefixes, size | Not mion's layer: mion sets no cookie; docs advice. |
| 3.4.1 HSTS, 3.7.4 preload | Not mion's layer: proxy or `responseHeaders`; docs advice. |
| 3.4.2 CORS origin allowlist | Covered with mionSecurity: listed origins, `null` never trusted, `'*'` with credentials throws. |
| 3.4.3/3.4.6/3.4.7 CSP, frame-ancestors | Not mion's layer: apply to HTML documents; mion answers JSON only. |
| 3.4.4 nosniff | Covered with mionSecurity. |
| 3.4.5 Referrer-Policy, 3.4.8 COOP | Not mion's layer: document responses. |
| 3.5.1-3.5.3 CSRF, simple requests, safe methods | Covered with mionSecurity: crossOrigin, JSON body only, methodByIntent. |
| 3.5.4 separate hostnames | Not mion's layer: deployment. |
| 3.5.5 postMessage, 3.5.6 JSONP, 3.5.7 data in scripts | Covered: none exist in mion. |
| 3.5.8 authenticated resources embedded cross-site | Covered with mionSecurity: the browser blocks a JSON answer with `nosniff` from a no-cors load. `Cross-Origin-Resource-Policy` is not added: a raw middleware serving an embeddable file would break (question raised in the PR). |
| 3.6.1 SRI | Not mion's layer: client assets. |
| 3.7.1, 3.7.3, 3.7.5 | Not mion's layer: client app. |
| 3.7.2 redirect allowlist | Covered: mion sends no redirect. |

### ASVS 5 V4 API and Web Service

| Item | Verdict |
| --- | --- |
| 4.1.1 Content-Type with charset | Covered: `application/json; charset=utf-8` on every mion answer. |
| 4.1.2 HTTP to HTTPS redirects | Not mion's layer: proxy. |
| 4.1.3 proxy-set headers not overridable | Covered: mion reads no `X-Forwarded-*`; docs advice. |
| 4.1.4 only supported methods | Covered with mionSecurity (`methodByIntent`); without it every method runs the route. |
| 4.1.5 message signatures | Not mion's layer. |
| 4.2.1 request framing | Fixed here for uws; uWS itself refuses CL+TE (now tested). node and bun parsers refuse CL+TE, duplicate CL and bad TE. uWS also refuses chunk extensions RFC 9112 allows: fails closed, not a gap. |
| 4.2.2 response framing | Fixed here: HEAD body on uws, handler `transfer-encoding` on node, gcloud, uws, aws. bun drops it itself (probed); cloudflare and vercel answer with a `Response` whose runtime sets the framing. |
| 4.2.3/4.2.4 HTTP/2 connection headers, CR/LF | Covered: node's http2 and the header stores refuse CR, LF, NUL (earlier audit). |
| 4.2.5 outgoing request size | Fixed here: the client's `?data=` GET allowed a 4096-character URL, which uws refuses with a 431 (its whole head is capped near 4 KB). It now POSTs past 2048. |
| 4.3 GraphQL, 4.4 WebSocket | Not applicable: mion has neither. |

### Attack classes

| Class | Verdict |
| --- | --- |
| Request smuggling | Fixed here for uws (see 4.2.1); node, bun refuse every probed shape. |
| Host header attacks | Covered: mion builds no URL from `Host`; it only compares it with `Origin` when `Sec-Fetch-Site` is missing. Node accepts two `Host` headers (uws and bun refuse); harmless for that check. |
| Web cache poisoning and deception | Fixed here, with mionSecurity: `Vary` lists the headers a chain declares. `Cache-Control` stays the app's; docs advice. |
| HTTP/2 issues | Covered: only node serves HTTP/2 (through a host server); its parser enforces the rules. |
| CORS misconfiguration | Covered by mionSecurity (see 3.4.2). |
| Unrestricted resource consumption | Covered: per-route `maxBodySize` before buffering, header size limits (node 8 KB, uws 4 KB, bun native), build-fixed batches. Rate limits and timeouts are the proxy's or the server's (no adapter shares a client identity, and one process cannot count across instances); docs advice. |
