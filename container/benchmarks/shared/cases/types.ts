// The competitor-AGNOSTIC shared case: samples + metadata only. It carries NO
// `createValidateFn` / `ts-runtypes` imports, so a competitor that
// imports the shared suite never transitively pulls the marker package or the
// plugin — the ts-runtypes validators live in the ts-go competitor module,
// exactly like every other competitor's do.

export interface SharedCase {
  title: string;
  description?: string;
  /** Pure sample data — identical for every competitor. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
  /** ts-runtypes is unsupported-at-root for this kind (its validator throws
   *  by design — `factoryThrows`); a competitor may consult this to declare
   *  NOT_SUPPORTED. Metadata only — the runner does not act on it. */
  factoryThrows?: boolean;
}

/** One expected format-error descriptor, index-parallel to a case's invalid
 *  samples. `null` = "expect an error but assert nothing about its payload". */
export interface FormatErrorExpectation {
  name: string;
  val?: unknown;
  formatPathTail?: string;
}

export type FormatValidationCase = SharedCase & {
  expectedFormatErrors?: () => Array<FormatErrorExpectation | null>;
};

/** A case whose SUBJECT is a draft 2020-12 schema keyword. The document lives on
 *  the case as plain library-free data so the ajv column compiles the very same
 *  bytes rather than a re-typed lookalike. These cases live inside the validation
 *  and format-validation suites (group `JSON_SCHEMA` in each), not a suite of
 *  their own — see ./json-schema/index.ts. */
export type JsonSchemaCase = SharedCase & {
  /** The draft 2020-12 document under test. Plain data: no library types. */
  schema: unknown;
};

/** The format-validation half of the JSON_SCHEMA group: same document field, but
 *  it sits in a suite whose cases may also carry `expectedFormatErrors`. */
export type JsonSchemaFormatCase = FormatValidationCase & {
  schema: unknown;
};
