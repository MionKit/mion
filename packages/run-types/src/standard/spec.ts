// Standard Schema v1 interface — copied from `@standard-schema/spec` (MIT) to keep this package free of
// runtime dependencies, with the upstream `StandardSchemaV1` namespace flattened to top-level aliases
// (the repo's eslint forbids `namespace` in `.ts`). The SHAPES are byte-identical, so an object produced
// here is structurally assignable to a consumer's `StandardSchemaV1` from the real spec package.
// See https://github.com/standard-schema/standard-schema.

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

// Standard JSON Schema v1 — the companion conversion interface, flattened like the ones above. A single
// object may satisfy BOTH by carrying `validate` and `jsonSchema` under one `~standard`, which is what
// `createStandardSchema` returns.

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

/** The conversion options. Only `'draft-2020-12'` is supported, and of the vendor-specific
 *  `libraryOptions` mion reads `{portable: true}`, which strips its dialect keywords. */
export interface StandardJSONSchemaOptions {
  readonly target?: string;
  readonly libraryOptions?: Record<string, unknown> | undefined;
}
