# Keep TypedError/RpcError internal `message`/`name` off the wire — DONE

**Status:** done (2026-07-15, PR #123 commit `42460251`)
**Created:** 2026-07-15

## Problem

@ts-runtypes always serializes REQUIRED lib-`Error` members (`name`/`message`) by name,
regardless of runtime enumerability; only OPTIONAL global-inherited props (e.g. `stack?`) get
the runtime enumerability guard (deliberate, so `DataOnly<T>` stays consistent with what is
serialized). mion exposes `publicMessage` and keeps the internal `message` OFF the wire (its
classes define `message`/`name` non-enumerable). So `createJsonEncoder<RpcError<string>>()`
was emitting `{"publicMessage":…,"name":"RpcError","message":"<internal>", …}` — leaking the
internal message. Pre-existing (0.9.1 kept them in the projection too), not new to the bump.

## Fix (maintainer direction)

Override `message`/`name` in `TypedError` as **OPTIONAL + `@nonEnumerable`** so the resolver
emits the runtime enumerability guard for them; the constructor already defines them
non-enumerable, so they are skipped when serializing. `DataOnly<T>` stays consistent (they are
optional in the projected shape).

TS forbids widening `Error`'s REQUIRED `message`/`name` to optional (TS2416), so the base is
re-typed once via `Omit` (maintainer's suggestion, cleaner than `@ts-expect-error`):

```ts
const ErrorBase = Error as unknown as {new (message?: string): Omit<Error, 'message' | 'name'>};
export class TypedError<ErrType extends string> extends ErrorBase {
    /** @nonEnumerable */ declare message?: string;
    /** @nonEnumerable */ declare name?: string;
    …
}
```

Runtime is still `Error` (`instanceof Error` holds); `stack`/`cause` stay inherited-optional
(already guarded). `RpcError` inherits the optional declarations.

## Result

RpcError wire is now the public envelope only —
`{publicMessage, mion@isΣrrθr, type, id?, errorData?, statusCode?}` — matching native
`JSON.stringify`; round-trip + `instanceof` still hold. Pinned by a new test in
`mionClassSerializers.spec.ts` ("keeps the internal `message` and `name` OFF the wire").

## General rule for error subclasses

To keep a prop off the wire it must be (1) non-enumerable at runtime, (2) OPTIONAL in the type,
and (3) tagged `@nonEnumerable` — unless it is an already-optional global-inherited prop like
`stack?`, which is guarded automatically. A REQUIRED `@nonEnumerable` prop has no effect and
warns (NE001).
