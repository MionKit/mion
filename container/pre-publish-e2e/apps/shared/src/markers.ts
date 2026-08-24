// Family 9 — Markers. A user-defined helper carrying InjectRunTypeId<T> is
// rewritten so the build injects a reflection handle for T at every call site.
// Inside the helper the handle is resolved by FORWARDING it to a public resolver
// (getRunType / getRunTypeId) as the trailing argument — the documented wrapper
// pattern. The wrapper's result matches the canonical direct getRunType<T>() /
// getRunTypeId<T>(). A local look-alike marker (not @ts-runtypes/core's) stays
// inert. Mirrors guide/markers-wrap-helper.ts + markers-not-triggered.ts.
//
// (Fixed: the injected handle is an opaque entry tuple, so the old
// getRTUtils().getRunType(id) path returned undefined; forwarding to
// getRunType / getRunTypeId resolves it.)
import {getRunType, getRunTypeId, RunTypeKind, type InjectRunTypeId, type RunType} from '@ts-runtypes/core';
import {type CheckResult, ok, eq} from './check';

interface User {
  id: number;
  name: string;
}

// Canonical direct reflection — the robust baseline the wrappers must match.
export const userReflected = getRunType<User>();
export const userTypeId = getRunTypeId<User>();

// A wrapper helper: declare a trailing `id?: InjectRunTypeId<T>` and the build
// injects a reflection handle for T at every call site. Resolve the handle by
// forwarding it to getRunTypeId (returns the id string) / getRunType (the node).
export function describeType<T>(id?: InjectRunTypeId<T>): string {
  return getRunTypeId<T>(undefined, id);
}
export function reflectType<T>(id?: InjectRunTypeId<T>): RunType<T> {
  return getRunType<T>(undefined, id);
}

// A value-carrying helper: the marker also fires on the value-first shape.
export function typeIdOfValue<T>(_value: T, id?: InjectRunTypeId<T>): string {
  return getRunTypeId<T>(undefined, id);
}

// A local look-alike marker that is NOT ours — call sites using it stay inert.
type LocalInject<T> = string & {__localBrand?: T};
export function homemade<T>(id?: LocalInject<T>): string {
  return id ?? 'nothing injected';
}

export function checkMarkers(): CheckResult[] {
  const wrappedId = describeType<User>();
  const wrappedNode = reflectType<User>();
  const valueId = typeIdOfValue({id: 1, name: 'Ada'});
  return [
    // The wrapper forwards its injected handle and resolves to the SAME id as the
    // direct getRunTypeId<User>() — the handle is usable, not an opaque dead end.
    eq('markers: static-shape wrapper resolves the injected handle to the canonical id', wrappedId, userTypeId),
    // The value-first wrapper shape resolves to the same id from an inferred T.
    eq('markers: value-first wrapper resolves the injected handle to the canonical id', valueId, userTypeId),
    // Regression guard: TWO getRunTypeId<User>() calls as arguments to the generic
    // eq() in ONE statement. eq<T> infers T = InjectRunTypeId<User> from both
    // branded args — the shape that used to make the scanner treat eq() itself as
    // an enclosing marker and silently drop BOTH injections (getRunTypeId then
    // threw "no id injected" at runtime). Both must inject and resolve equal.
    // NB: keep the literal `getRunTypeId<...>()` call syntax OUT of this description
    // string - test/rewrite-evidence.test.mjs regex-scans the dist BYTES for residual
    // un-rewritten markers, and a description embedding that syntax survives into the
    // bundle as a string and trips the check (the calls below ARE rewritten).
    eq('markers: two getRunTypeId reflections of User as generic-fn args in one statement both inject', getRunTypeId<User>(), getRunTypeId<User>()),
    // Forwarding to getRunType returns the real traversable node for T.
    ok(
      'markers: wrapper forwarded to getRunType returns the User object node',
      wrappedNode.kind === RunTypeKind.objectLiteral && wrappedNode.id === userTypeId
    ),
    // Direct reflection still resolves the User node as an object shape.
    ok('markers: direct reflection resolves the User node as an object shape', userReflected.kind === RunTypeKind.objectLiteral),
    // The local look-alike is never injected: id stays undefined at runtime.
    ok('markers: local look-alike marker stays inert', homemade<number>() === 'nothing injected'),
  ];
}
