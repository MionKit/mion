// The json-schema-dropped-intent rule — the plugin's one local-AST lane.
//
// The walker is pure (ESTree in, findings out), so these units drive it with
// hand-built ESTree nodes — no parser in the loop; the real-parse path rides
// the oxlint-e2e suite, which lints a schema fixture through the actual
// binary. The adapter-side gating (a file that never names
// runTypeFromJsonSchema gets an EMPTY visitor) is pinned through the same
// mock host every transport rule uses.
import {describe, expect, it} from 'vitest';
import {collectDroppedIntent, droppedIntentFindings, unwrapExpression, type AstNode} from '../../src/eslint/droppedIntent.ts';
import plugin from '../../src/eslint/index.ts';
import {makeFixtureProject} from './fixture.ts';

// ── tiny ESTree builders ────────────────────────────────────────────────────
let line = 0;
const loc = () => {
  line += 1;
  return {start: {line, column: 2}, end: {line, column: 12}};
};
const id = (name: string): AstNode => ({type: 'Identifier', name, loc: loc()});
const lit = (value: unknown): AstNode => ({type: 'Literal', value, loc: loc()});
const prop = (name: string, value: AstNode): AstNode => ({type: 'Property', computed: false, key: id(name), value});
const obj = (...properties: AstNode[]): AstNode => ({type: 'ObjectExpression', properties, loc: loc()});
const arr = (...elements: AstNode[]): AstNode => ({type: 'ArrayExpression', elements, loc: loc()});
const call = (calleeName: string, arg: AstNode): AstNode => ({
  type: 'CallExpression',
  callee: id(calleeName),
  arguments: [arg],
  loc: loc(),
});

describe('collectDroppedIntent — the pure walker', () => {
  it('warns on readOnly/writeOnly: true at any position, quiet on false and on other annotations', () => {
    const schema = obj(
      prop('type', lit('object')),
      prop('readOnly', lit(true)),
      prop('title', lit('User')),
      prop(
        'properties',
        obj(
          prop('id', obj(prop('type', lit('string')), prop('readOnly', lit(true)))),
          prop('draft', obj(prop('type', lit('string')), prop('writeOnly', lit(true)))),
          prop('free', obj(prop('type', lit('string')), prop('readOnly', lit(false))))
        )
      )
    );
    const found = collectDroppedIntent(schema);
    expect(found.map((f) => f.message.slice(0, 20))).toEqual([
      `'readOnly: true' is `,
      `'readOnly: true' is `,
      `'writeOnly: true' is`,
    ]);
    // Position-accurate: each finding carries its own key's location.
    expect(new Set(found.map((f) => f.loc.start.line)).size).toBe(3);
  });

  it('warns on orphaned then/else and minContains/maxContains, quiet when the trigger sibling exists', () => {
    const orphaned = obj(
      prop('then', obj(prop('type', lit('string')))),
      prop('else', obj(prop('type', lit('number')))),
      prop('minContains', lit(2)),
      prop('maxContains', lit(3))
    );
    expect(collectDroppedIntent(orphaned).map((f) => f.message.split(' ')[0])).toEqual([
      "'then'",
      "'else'",
      "'minContains'",
      "'maxContains'",
    ]);
    const triggered = obj(
      prop('if', obj(prop('type', lit('string')))),
      prop('then', obj(prop('minLength', lit(1)))),
      prop('else', obj(prop('maxLength', lit(2)))),
      prop('contains', obj(prop('type', lit('number')))),
      prop('minContains', lit(2))
    );
    expect(collectDroppedIntent(triggered)).toEqual([]);
  });

  it('recurses through combinator lists, maps and single-schema positions', () => {
    const schema = obj(prop('allOf', arr(obj(prop('writeOnly', lit(true))))));
    expect(collectDroppedIntent(schema)).toHaveLength(1);
    const nested = obj(prop('$defs', obj(prop('inner', obj(prop('items', obj(prop('readOnly', lit(true)))))))));
    expect(collectDroppedIntent(nested)).toHaveLength(1);
  });

  it('droppedIntentFindings gates on the callee name and unwraps as-const', () => {
    const schema = obj(prop('writeOnly', lit(true)));
    const asConst: AstNode = {type: 'TSAsExpression', expression: schema};
    expect(unwrapExpression(asConst)).toBe(schema);
    expect(droppedIntentFindings(call('runTypeFromJsonSchema', asConst))).toHaveLength(1);
    expect(droppedIntentFindings(call('someOtherBuilder', asConst))).toEqual([]);
  });
});

describe('json-schema-dropped-intent — the host surface', () => {
  const rule = plugin.rules['json-schema-dropped-intent'];

  it('is registered with a warn default in the recommended config', () => {
    expect(rule).toBeDefined();
    const recommended = (plugin.configs['recommended'] as {rules: Record<string, string>}).rules;
    expect(recommended['runtypes/json-schema-dropped-intent']).toBe('warn');
  });

  it('returns an EMPTY visitor for files that never name runTypeFromJsonSchema', () => {
    const project = makeFixtureProject();
    const context = {
      physicalFilename: project.write('plain.ts', `export const n = 1;\n`),
      sourceCode: {text: `export const n = 1;\n`},
      settings: {},
      report: () => {
        throw new Error('must not report');
      },
    };
    expect(Object.keys(rule.create(context as never))).toEqual([]);
    project.cleanup();
  });

  it('reports through the standard report shape when a call site carries dropped intent', () => {
    const reports: unknown[] = [];
    const text = `import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';\n`;
    const context = {
      physicalFilename: '/tmp/x.ts',
      sourceCode: {text},
      settings: {},
      report: (r: unknown) => reports.push(r),
    };
    const visitor = rule.create(context as never) as {CallExpression?: (node: AstNode) => void};
    expect(visitor.CallExpression).toBeDefined();
    visitor.CallExpression?.(call('runTypeFromJsonSchema', obj(prop('readOnly', lit(true)))));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({loc: {start: {column: 2}}});
  });
});
