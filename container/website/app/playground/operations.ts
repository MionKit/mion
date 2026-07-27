// The build functions the playground offers. `factory` is the ts-runtypes
// export; `fnKey` matches the marker overlay. `kind` selects how the engine
// invokes it and how the result is shaped.
//
// Several JSON entries share the same `createJsonEncoderFn` / `createJsonDecoderFn`
// factory but differ by `options` — the comptime `{strategy: '…'}` literal the
// engine appends at the call site. That literal is folded into the injected fn
// hash (never read at runtime), so each strategy resolves to its own cache entry,
// exactly as it does in the serialization benchmarks.

export type OperationKind = 'predicate' | 'errors' | 'encode' | 'jsonRoundtrip' | 'binaryEncode' | 'binaryRoundtrip' | 'graph';

export interface Operation {
  key: string;
  factory: string;
  fnKey: string | null;
  kind: OperationKind;
  // `<optgroup>` heading + `<option>` text for the picker.
  group: string;
  menuLabel: string;
  // The factory name (used as the info-block heading / surrounding-code label).
  label: string;
  // One-line summary shown as the info-block title; `detail` is the longer body.
  blurb: string;
  detail: string;
  needsInput: boolean;
  // The variable name used when the playground shows the call as real code:
  // `const <varName> = <factory><MyType>();` in the type column's header/footer
  // and the "after build" transformed view.
  varName: string;
  // The comptime options literal appended at the call site — e.g.
  // `{strategy: 'mutate'}`. Baked into the injected fn hash at build time, so it
  // selects the strategy without any runtime branching. Absent = no options.
  options?: string;
  // For roundtrip decode ops only: the encoder options used to produce the wire
  // the decoder then reads back (the intermediate shown in the Encoded block).
  encodeOptions?: string;
}

export const OPERATIONS: readonly Operation[] = [
  {
    key: 'validate',
    factory: 'createValidateFn',
    fnKey: 'val',
    kind: 'predicate',
    group: 'Validation',
    menuLabel: 'validate',
    label: 'createValidateFn',
    blurb: 'Type guard for the type.',
    detail:
      'Returns a function that answers true when the value matches the type and false otherwise — the classic runtime type check.',
    needsInput: true,
    varName: 'validate',
  },
  {
    key: 'errors',
    factory: 'createGetValidationErrorsFn',
    fnKey: 'verr',
    kind: 'errors',
    group: 'Validation',
    menuLabel: 'get validation errors',
    label: 'createGetValidationErrorsFn',
    blurb: 'List every validation error.',
    detail:
      'Returns a function that reports each place the value diverges from the type. An empty list means the value is valid.',
    needsInput: true,
    varName: 'getErrors',
  },
  {
    key: 'jsonEncoderClone',
    factory: 'createJsonEncoderFn',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    group: 'JSON encode',
    menuLabel: 'json enc clone (default)',
    label: 'createJsonEncoderFn',
    blurb: 'Encode to JSON and removes unknown keys by cloning objects.',
    detail:
      'Clones the declared type, so unknown keys are dropped for free, then hands it to JSON.stringify. Never touches your input. This is the default strategy.',
    needsInput: true,
    varName: 'toJson',
    options: "{strategy: 'clone'}",
  },
  {
    key: 'jsonEncoderMutate',
    factory: 'createJsonEncoderFn',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    group: 'JSON encode',
    menuLabel: 'json enc mutate',
    label: 'createJsonEncoderFn',
    blurb: 'Encode in place, keeping unknown keys.',
    detail:
      'Transforms leaves in place with no clone allocation, so it is the fastest option — but it mutates the object you pass in and keeps undeclared keys on the wire. When no special encoding is needed, it is equivalent to a direct JSON.stringify.',
    needsInput: true,
    varName: 'toJson',
    options: "{strategy: 'mutate'}",
  },
  {
    key: 'jsonEncoderDirect',
    factory: 'createJsonEncoderFn',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    group: 'JSON encode',
    menuLabel: 'json enc direct',
    label: 'createJsonEncoderFn',
    blurb: 'Single-pass encode straight to a string.',
    detail:
      'Serialises in one pass with no clone and no mutation, always stripping undeclared keys. Allocation-free, a touch slower on deeply nested shapes.',
    needsInput: true,
    varName: 'toJson',
    options: "{strategy: 'direct'}",
  },
  {
    key: 'jsonEncoderCompact',
    factory: 'createJsonEncoderFn',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    group: 'JSON encode',
    menuLabel: 'json enc compact',
    label: 'createJsonEncoderFn',
    blurb: 'Encode as positional arrays (smallest wire).',
    detail:
      'Emits each object as a positional array with no key names on the wire, producing the smallest JSON. Pairs with the compact decoder; both ends must share the type.',
    needsInput: true,
    varName: 'toJson',
    options: "{strategy: 'compact'}",
  },
  {
    key: 'jsonDecoderStrip',
    factory: 'createJsonDecoderFn',
    fnKey: 'jsonDecoder',
    kind: 'jsonRoundtrip',
    group: 'JSON decode',
    menuLabel: 'json dec remove unknown keys (default)',
    label: 'createJsonDecoderFn',
    blurb: 'Decode JSON, dropping undeclared keys.',
    detail:
      'Parses the JSON and removes any key not declared in the type before rebuilding the value (undeclared keys become undefined). This is the default strategy. Your input is encoded first (mutate strategy, so extra keys reach the wire) and then decoded, so the full round trip is visible.',
    needsInput: true,
    varName: 'fromJson',
    options: "{strategy: 'strip'}",
    encodeOptions: "{strategy: 'mutate'}",
  },
  {
    key: 'jsonDecoderPreserve',
    factory: 'createJsonDecoderFn',
    fnKey: 'jsonDecoder',
    kind: 'jsonRoundtrip',
    group: 'JSON decode',
    menuLabel: 'json dec keep unknown keys',
    label: 'createJsonDecoderFn',
    blurb: 'Decode JSON, keeping every key.',
    detail:
      'Parses the JSON and passes undeclared keys through untouched. Compare with the default: the same encoded wire keeps its extra keys here.',
    needsInput: true,
    varName: 'fromJson',
    options: "{strategy: 'preserve'}",
    encodeOptions: "{strategy: 'mutate'}",
  },
  {
    key: 'binaryEncoder',
    factory: 'createBinaryEncoderFn',
    fnKey: 'tb',
    kind: 'binaryEncode',
    group: 'Binary',
    menuLabel: 'binary enc',
    label: 'createBinaryEncoderFn',
    blurb: 'Encode to a compact binary buffer.',
    detail:
      'Serialises the value into a tightly packed binary buffer, shown here as hex. Much smaller than JSON for the same data.',
    needsInput: true,
    varName: 'toBinary',
  },
  {
    key: 'binaryDecoder',
    factory: 'createBinaryDecoderFn',
    fnKey: 'fb',
    kind: 'binaryRoundtrip',
    group: 'Binary',
    menuLabel: 'binary dec',
    label: 'createBinaryDecoderFn',
    blurb: 'Decode a binary buffer back to data.',
    detail:
      'Reads the packed binary buffer back into the data type. Your input is encoded first and then decoded, so the full round trip is visible.',
    needsInput: true,
    varName: 'fromBinary',
  },
  {
    key: 'graph',
    factory: 'getRunType',
    fnKey: null,
    kind: 'graph',
    group: 'Reflection',
    menuLabel: 'getRunType',
    label: 'getRunType',
    blurb: 'Unpack the resolved RunType.',
    detail:
      'Resolves the type to its RunType — the structured description RunTypes builds from your type — and unpacks the live node graph descending from it, each node holding its actual children. A recursive type shows its back edge as a circular reference; nothing else is a reference.',
    needsInput: false,
    varName: 'runType',
  },
];

export function operationByKey(key: string): Operation {
  return OPERATIONS.find((op) => op.key === key) ?? OPERATIONS[0];
}
