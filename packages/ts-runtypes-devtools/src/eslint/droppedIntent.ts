// The `json-schema-dropped-intent` rule — the plugin's ONE local-AST lane.
//
// Every other rule is a pure router over resolver wire diagnostics, but the
// resolver never SEES a JSON Schema document: the door is deliberately
// type-level only, so an accepted keyword whose intent the pipeline cannot
// honor (`readOnly: true`, `writeOnly: true`, an orphaned `then`) would drop
// silently — the one thing the disposition doctrine forbids. The TYPE level
// has only errors, and erroring on a spec-legal annotation would block
// real-world OpenAPI documents. So this rule walks `runTypeFromJsonSchema({…})`
// literals in the linted file itself and WARNS, position-accurately, wherever
// declared intent is read and ignored:
//
//   - `readOnly: true` / `writeOnly: true` at ANY position — annotations the
//     pipeline cannot honor (no read/write direction modeling exists);
//   - `then` / `else` without a sibling `if` — annotations per 2020-12;
//   - `minContains` / `maxContains` without a sibling `contains` — same.
//
// The walker is exported pure (ESTree in, findings out) so the unit tests can
// drive it without a host parser; both lint hosts hand the rule the same
// ESTree shape (oxlint's jsPlugin AST is ESTree, `SOURCE_CODE.isESTree`).

/** The minimal ESTree surface the walker reads — typed locally so the plugin
 *  depends on neither host's AST package. **/
export interface AstNode {
  type: string;
  loc?: SourceLocation;
  [key: string]: unknown;
}
export interface SourceLocation {
  start: {line: number; column: number};
  end: {line: number; column: number};
}
export interface DroppedIntentFinding {
  message: string;
  loc: {start: {line: number; column: number}; end?: {line: number; column: number}};
}

const GUIDE_POINTER = 'see the Annotations section of the JSON Schema guide';

// Subschema positions, by value shape: a single schema, a map of schemas, or
// a list of schemas. Mirrors the door's own vocabulary (fromJsonSchema.ts).
const SUBSCHEMA_KEYS = new Set([
  'items',
  'additionalProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
]);
const SUBSCHEMA_MAP_KEYS = new Set(['properties', 'patternProperties', '$defs', 'dependentSchemas']);
const SUBSCHEMA_LIST_KEYS = new Set(['prefixItems', 'anyOf', 'oneOf', 'allOf']);

function propertyName(prop: AstNode): string | undefined {
  if (prop.type !== 'Property' || prop.computed === true) return undefined;
  const key = prop.key as AstNode | undefined;
  if (!key) return undefined;
  if (key.type === 'Identifier') return key.name as string;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

const isLiteralTrue = (node: AstNode | undefined): boolean => node?.type === 'Literal' && node.value === true;

function findingAt(key: AstNode | undefined, message: string): DroppedIntentFinding {
  const loc = key?.loc ?? {start: {line: 1, column: 0}, end: {line: 1, column: 0}};
  return {message, loc: {start: loc.start, end: loc.end}};
}

/** Walk one schema ObjectExpression and collect every dropped-intent finding.
 *  Pure — ESTree in, findings out. **/
export function collectDroppedIntent(schema: AstNode): DroppedIntentFinding[] {
  const findings: DroppedIntentFinding[] = [];
  const walk = (node: AstNode | null | undefined): void => {
    if (!node || node.type !== 'ObjectExpression') return;
    const properties = (node.properties as AstNode[] | undefined) ?? [];
    const siblingNames = new Set(properties.map(propertyName).filter((n): n is string => n !== undefined));
    for (const prop of properties) {
      const name = propertyName(prop);
      if (name === undefined) continue;
      const value = prop.value as AstNode | undefined;
      const key = prop.key as AstNode | undefined;
      if ((name === 'readOnly' || name === 'writeOnly') && isLiteralTrue(value)) {
        findings.push(
          findingAt(
            key,
            `'${name}: true' is an annotation the pipeline cannot honor — the schema builds, but nothing enforces the intent (${GUIDE_POINTER})`
          )
        );
      }
      if ((name === 'then' || name === 'else') && !siblingNames.has('if')) {
        findings.push(
          findingAt(
            key,
            `'${name}' without a sibling 'if' is an annotation per 2020-12 — it constrains nothing here (${GUIDE_POINTER})`
          )
        );
      }
      if ((name === 'minContains' || name === 'maxContains') && !siblingNames.has('contains')) {
        findings.push(
          findingAt(
            key,
            `'${name}' without a sibling 'contains' is an annotation per 2020-12 — it constrains nothing here (${GUIDE_POINTER})`
          )
        );
      }
      if (SUBSCHEMA_KEYS.has(name)) walk(value);
      else if (SUBSCHEMA_MAP_KEYS.has(name) && value?.type === 'ObjectExpression') {
        for (const entry of (value.properties as AstNode[] | undefined) ?? []) {
          if (entry.type === 'Property') walk(entry.value as AstNode);
        }
      } else if (SUBSCHEMA_LIST_KEYS.has(name) && value?.type === 'ArrayExpression') {
        for (const element of (value.elements as (AstNode | null)[] | undefined) ?? []) walk(element);
      }
    }
  };
  walk(schema);
  return findings;
}

/** Unwrap `expr as const` / `expr satisfies X` / parenthesized wrappers down
 *  to the underlying expression. **/
export function unwrapExpression(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' || current.type === 'TSSatisfiesExpression' || current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression as AstNode | undefined;
  }
  return current;
}

/** The CallExpression handler body: a `runTypeFromJsonSchema({…})` call site
 *  yields its schema literal's findings, anything else yields none. **/
export function droppedIntentFindings(callNode: AstNode): DroppedIntentFinding[] {
  const callee = callNode.callee as AstNode | undefined;
  if (callee?.type !== 'Identifier' || callee.name !== 'runTypeFromJsonSchema') return [];
  const args = callNode.arguments as AstNode[] | undefined;
  const schema = unwrapExpression(args?.[0]);
  if (!schema || schema.type !== 'ObjectExpression') return [];
  return collectDroppedIntent(schema);
}
