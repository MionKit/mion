// Standard Schema v1 interface — copied from `@standard-schema/spec` (MIT) to
// preserve this package's zero-runtime-dependency posture. The upstream package
// declares these under a `StandardSchemaV1` namespace; we flatten them to
// top-level type aliases (the repo's eslint forbids `namespace` in `.ts`). The
// SHAPES are byte-identical, so an object produced here is structurally
// assignable to a consumer's `StandardSchemaV1` from the real spec package.
//
// Standard Schema is a validation-only interop contract: a "standard schema" is
// any object exposing a readonly `"~standard"` property. It is consumed by
// tRPC, TanStack Form/Router, React Hook Form, Hono, and others. See
// https://github.com/standard-schema/standard-schema.

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly '~standard': StandardSchemaProps<Input, Output>;
}

/** The Standard Schema properties interface. */
export interface StandardSchemaProps<Input = unknown, Output = Input> {
  /** The version number of the standard. */
  readonly version: 1;
  /** The vendor name of the schema library. */
  readonly vendor: string;
  /** Validates unknown input values. */
  readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  /** Inferred types associated with the schema. */
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

/** The result interface of the validate function. */
export type StandardSchemaResult<Output> = StandardSchemaSuccessResult<Output> | StandardSchemaFailureResult;

/** The result interface if validation succeeds. */
export interface StandardSchemaSuccessResult<Output> {
  /** The typed output value. */
  readonly value: Output;
  /** A falsy value for `issues` indicates success. */
  readonly issues?: undefined;
}

/** The result interface if validation fails. */
export interface StandardSchemaFailureResult {
  /** The issues of failed validation. */
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

/** The issue interface of the failure output. */
export interface StandardSchemaIssue {
  /** The error message of the issue. */
  readonly message: string;
  /** The path of the issue, if any. */
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaPathSegment> | undefined;
}

/** The path segment interface of the issue. */
export interface StandardSchemaPathSegment {
  /** The key representing a path segment. */
  readonly key: PropertyKey;
}

/** The Standard Schema types interface. */
export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  /** The input type of the schema. */
  readonly input: Input;
  /** The output type of the schema. */
  readonly output: Output;
}

/** Infers the input type of a Standard Schema. */
export type StandardSchemaInferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input'];

/** Infers the output type of a Standard Schema. */
export type StandardSchemaInferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output'];

// Standard JSON Schema v1 — the companion interface for schema-to-JSON-Schema
// conversion (upstream: StandardJSONSchemaV1 in `@standard-schema/spec`,
// flattened here like the validation interfaces above). A single object may
// satisfy BOTH interfaces by carrying `validate` and `jsonSchema` side by side
// under one `~standard`, which is exactly what `createStandardSchema` returns.

/** The Standard JSON Schema interface. */
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  /** The Standard JSON Schema properties. */
  readonly '~standard': StandardJSONSchemaProps<Input, Output>;
}

/** The Standard JSON Schema properties interface. */
export interface StandardJSONSchemaProps<Input = unknown, Output = Input> {
  /** The version number of the standard. */
  readonly version: 1;
  /** The vendor name of the schema library. */
  readonly vendor: string;
  /** Methods generating the input / output JSON Schema documents. */
  readonly jsonSchema: StandardJSONSchemaConverter;
  /** Inferred types associated with the schema. */
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

/** The input / output JSON Schema conversion methods. */
export interface StandardJSONSchemaConverter {
  /** Converts the input type to a JSON Schema document. */
  readonly input: (options?: StandardJSONSchemaOptions) => Record<string, unknown>;
  /** Converts the output type to a JSON Schema document. */
  readonly output: (options?: StandardJSONSchemaOptions) => Record<string, unknown>;
}

/** The conversion options. `target` names the JSON Schema dialect to emit
 *  (only `'draft-2020-12'` is supported); `libraryOptions` carries
 *  vendor-specific flags — mion reads `{portable: true}` to strip its
 *  dialect keywords from the returned document. */
export interface StandardJSONSchemaOptions {
  readonly target?: string;
  readonly libraryOptions?: Record<string, unknown> | undefined;
}
