---
type: fix
spec: guidelines
status: ready
created: 2026-09-16
---

# Two of the three refused property names are not hazards, and a record pays for it

## Intent

Every decoder, validator and rebuilding encoder refuses three property names
(`ts-go-runtypes/internal/reflection/unsafe_names.go:10`):

```go
var UnsafePropertyNames = []string{"__proto__", "prototype", "constructor"}
```

A decoder throws `[mion] Unsafe property name: <key>` on any of them, whatever the type says. That
is right for one of the three and costly for the other two.

Measured in node, against the exact shape the rebuild loops use (`r[k] = v[k]`):

```
r["__proto__"] = v     prototype CHANGED
r["constructor"] = v   plain own key, prototype untouched
r["prototype"] = v     plain own key, prototype untouched
```

So `__proto__` is a real prototype-pollution vector in our own rebuild loops and must stay refused
there. `prototype` and `constructor` are ordinary own keys on a plain object; refusing them buys no
safety in these loops.

What it costs is legitimate data. A `Record<string, string>` holding form fields, tags or a
translation map cannot carry a key named `constructor` or `prototype`: the decoder throws and the
request fails. Those are ordinary English words, and the type declared every string key as valid.

It also contradicts a rule this codebase just settled elsewhere: an index signature is open, it
admits every key, and a key it does not want is validation's to refuse rather than a decoder's to
reject. The unsafe-key guard is the one place that still refuses three keys under an index
signature that declares them all.

## Direction

Split the question by POSITION, because the two positions are not the same thing:

- **A declared property name** (`{constructor: string}`): keep refusing all three. A type declaring
  one of these names cannot round-trip, and the build already refuses it. Nothing to change.
- **A key admitted by an index signature**, where the key is DATA: this is where the refusal costs
  something. `prototype` and `constructor` should be carried like any other key.

`__proto__` in that data position needs its own decision, and there is a third option beyond keep
or drop. `JSON.parse` already puts `__proto__` on the parsed object as a plain own key without
touching any prototype; only our `r[k] = v[k]` copy re-introduces the hazard. Writing it with
`Object.defineProperty(r, k, {value, enumerable: true, writable: true, configurable: true})` lands
it as a safe own key, verified:

```
Object.defineProperty(r, "__proto__", ...)   own key: true   prototype changed: false
```

So the choice for `__proto__` under an index signature is: keep throwing (loud, predictable, refuses
valid-per-the-type data), or carry it safely through `defineProperty` (preserves the data, costs a
slower write on one key name). Weigh it against what a consumer does with the decoded object next,
since a safe own `__proto__` key can still surprise code downstream that copies it onward with a
plain assignment.

The implementer plans the details. Whatever lands must hold on every road that walks keys: the JSON
decoders, the compact decoder, the stripping restore, validate, and the rebuilding encoders. The
guard is generated from one list, so the shape of the fix is probably a position-aware check rather
than a second list.

While here, the message a caller gets for this is worth improving. A refused key surfaces through
the router's serialization error as fixed text, "Parameters might be of the wrong type", because a
compiled decoder's own message can quote internal detail and the real one is kept server-side on
`originalError` (`packages/router/src/dispatch.ts:254`). The unsafe-key refusal is the one case
where that caution is not needed: its text is mion's own constant and it names a key the caller
themselves sent, so it can be surfaced without leaking anything. It is also a larger share of what
reaches this path than it used to be, since a wrong-typed param now answers a validation error
instead. Any change here must keep the existing assertion that no engine text reaches the client.

## Done when

A record can carry `constructor` and `prototype` as data on every road; a declared property with one
of those names is still refused at build time; `__proto__` has one decided, documented behaviour
under an index signature that is the same on every road; and a test pins each position, since the
current suites cover only the declared-property side.
