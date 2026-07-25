// Unit tests of the transport-agnostic routing layer: wire diagnostic →
// {rule, message, loc}. Pure mapping — no binary, no worker.

import {describe, expect, it} from 'vitest';
import {routeDiagnostic, renderMessage, RULE_SPECS, type RuleName} from '../../src/eslint/diagnosticRouting.ts';
import {DIAGNOSTIC_CATALOG} from '../../src/diagnosticCatalog.ts';
import {Family, Severity, type Diagnostic} from '../../src/protocol.ts';

function diagnostic(partial: Partial<Diagnostic> & {code: string}): Diagnostic {
  return {
    family: Family.RunType,
    severity: Severity.Warning,
    site: {filePath: 'a.ts', startLine: 3, startCol: 5},
    ...partial,
  } as Diagnostic;
}

const ruleOf = (partial: Partial<Diagnostic> & {code: string}) => routeDiagnostic(diagnostic(partial)).ruleName;

describe('family routing (compiler diagnostics grouped by Go prefix family, named for what they catch)', () => {
  it('routes each family to its error rule, splitting warnings to the descriptive advisory rule', () => {
    // marker family folds MKR / CTA / PFN / TMP.
    expect(ruleOf({code: 'MKR003', family: Family.Marker, severity: Severity.Error})).toBe('invalid-marker');
    expect(ruleOf({code: 'MKR001', family: Family.Marker, severity: Severity.Warning})).toBe('redundant-marker');
    expect(ruleOf({code: 'CTA001', family: Family.Marker, severity: Severity.Error})).toBe('invalid-marker');
    // validate absorbs validationErrors (VL + VE).
    expect(ruleOf({code: 'VL001', severity: Severity.Error})).toBe('validate-non-serializable');
    expect(ruleOf({code: 'VL011', severity: Severity.Warning})).toBe('validate-skipped-member');
    expect(ruleOf({code: 'VE001', severity: Severity.Error})).toBe('validate-non-serializable');
    expect(ruleOf({code: 'VE020', severity: Severity.Warning})).toBe('validate-skipped-member');
    // json folds PJ / PJS / RJ / SJ / JCP.
    expect(ruleOf({code: 'SJ001', severity: Severity.Error})).toBe('json-non-serializable');
    expect(ruleOf({code: 'SJ011', severity: Severity.Warning})).toBe('json-skipped-member');
    expect(ruleOf({code: 'JCP001', severity: Severity.Error})).toBe('json-non-serializable');
    // binary folds TB / FB.
    expect(ruleOf({code: 'TB001', severity: Severity.Error})).toBe('binary-non-serializable');
    expect(ruleOf({code: 'FB011', severity: Severity.Warning})).toBe('binary-skipped-member');
    // clone keeps-by-reference rather than skipping.
    expect(ruleOf({code: 'CES001', severity: Severity.Error})).toBe('clone-unsupported-type');
    expect(ruleOf({code: 'CES010', severity: Severity.Warning})).toBe('clone-shared-reference');
    // single-tier families keep one rule at their own default.
    expect(ruleOf({code: 'PFE9012', family: Family.PureFn, severity: Severity.Error})).toBe('pure-functions');
    expect(ruleOf({code: 'FMT001', severity: Severity.Error})).toBe('format');
    expect(ruleOf({code: 'HUK010', severity: Severity.Warning})).toBe('unknown-keys');
    expect(ruleOf({code: 'NE001', severity: Severity.Error})).toBe('non-enumerable');
    expect(ruleOf({code: 'CLS001', severity: Severity.Warning})).toBe('class-serializer');
    // overrides mixes tiers.
    expect(ruleOf({code: 'OVR001', severity: Severity.Error})).toBe('invalid-override');
    expect(ruleOf({code: 'OVR010', severity: Severity.Warning})).toBe('override-side-effect');
  });

  it('keeps the stable code in the message for lookup and disable comments', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', args: ['onClick']}));
    expect(report.message).toContain('[VL011]');
    expect(report.message).toContain('onClick');
  });

  it('never drops a diagnostic: an unknown prefix routes by its wire family', () => {
    expect(ruleOf({code: 'ZZ999', family: Family.RunType, severity: Severity.Error})).toBe('other');
    expect(ruleOf({code: 'ZZ999', family: Family.Marker, severity: Severity.Error})).toBe('invalid-marker');
    expect(ruleOf({code: 'ZZ999', family: Family.PureFn, severity: Severity.Error})).toBe('pure-functions');
  });
});

describe('enrichment routing (per-concern rules, named for what they catch)', () => {
  const cases: Array<[string, Severity, RuleName]> = [
    ['FT020', Severity.Error, 'no-enrichment-todo'],
    ['MD020', Severity.Error, 'no-enrichment-todo'],
    ['FT023', Severity.Error, 'no-enrichment-todo'],
    ['MD023', Severity.Error, 'no-enrichment-todo'],
    ['FT021', Severity.Error, 'no-orphan-carcass'],
    ['FT022', Severity.Error, 'no-orphan-carcass'],
    ['MD021', Severity.Error, 'no-orphan-carcass'],
    ['MD022', Severity.Error, 'no-orphan-carcass'],
    ['FT002', Severity.Error, 'enrichment-field'],
    ['FT006', Severity.Error, 'enrichment-field'],
    ['FT003', Severity.Warning, 'enrichment-message'],
    ['FT005', Severity.Warning, 'enrichment-message'],
    ['MD001', Severity.Error, 'enrichment-field'],
    ['GE000', Severity.Error, 'enrichment-broken-source'],
    ['GE002', Severity.Error, 'enrichment-broken-source'],
    ['GE001', Severity.Warning, 'enrichment-misplaced-file'],
  ];
  it.each(cases)('%s (%s) → runtypes/%s', (code, severity, ruleName) => {
    expect(ruleOf({code, family: Family.Enrich, severity})).toBe(ruleName);
  });

  it('routes a FUTURE enrich code to the field tier matching its severity', () => {
    expect(ruleOf({code: 'FT099', family: Family.Enrich, severity: Severity.Error})).toBe('enrichment-field');
    expect(ruleOf({code: 'FT098', family: Family.Enrich, severity: Severity.Warning})).toBe('enrichment-message');
  });
});

// Go↔JS drift guard: every code the Go catalog can emit must route to a rule
// whose DEFAULT level matches the code's catalog severity. A new Go prefix, or
// a severity move, that the routing table doesn't cover fails here at PR time
// (mirrors the constant-sync tests in prefilter.test.ts).
describe('catalog coverage — every code routes to a rule with the matching default', () => {
  const RULE_DEFAULT = new Map<RuleName, 'error' | 'warn'>(RULE_SPECS.map((spec) => [spec.name, spec.default]));
  const enrichPrefixes = new Set(['FT', 'MD', 'GE']);
  const severityEnum = {error: Severity.Error, warning: Severity.Warning, info: Severity.Info} as const;

  it('maps all 148 codes with no gaps', () => {
    const codes = Object.keys(DIAGNOSTIC_CATALOG);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const entry = DIAGNOSTIC_CATALOG[code]!;
      const prefix = code.match(/^[A-Z]+/)![0];
      const family = enrichPrefixes.has(prefix) ? Family.Enrich : Family.RunType;
      const routed = ruleOf({code, family, severity: severityEnum[entry.severity]});
      const expectedDefault = entry.severity === 'error' ? 'error' : 'warn';
      expect(RULE_DEFAULT.get(routed), `${code} (${entry.severity}) routed to ${routed}`).toBe(expectedDefault);
    }
  });
});

describe('location conversion', () => {
  it('converts 1-based wire columns to 0-based loc columns and keeps 1-based lines', () => {
    const report = routeDiagnostic(
      diagnostic({
        code: 'FT020',
        family: Family.Enrich,
        site: {filePath: 'm.ts', startLine: 5, startCol: 4, endLine: 5, endCol: 9},
      })
    );
    expect(report.loc).toEqual({start: {line: 5, column: 3}, end: {line: 5, column: 8}});
  });

  it('emits a start-only loc when the wire site has no end (runtype-family sites)', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', site: {filePath: 'a.ts', startLine: 8, startCol: 48}}));
    expect(report.loc).toEqual({start: {line: 8, column: 47}});
  });

  it('clamps a degenerate site to 1:0 so the report still lands in the file', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', site: {filePath: 'a.ts', startLine: 0, startCol: 0}}));
    expect(report.loc.start).toEqual({line: 1, column: 0});
  });
});

describe('message rendering', () => {
  it('substitutes positional args through the catalog headline', () => {
    const message = renderMessage(diagnostic({code: 'FT002', family: Family.Enrich, args: ['nope']}));
    expect(message).toBe('[FT002] Unknown field `nope` — the type does not declare it, so this FriendlyText entry is dead.');
  });

  it('appends related locations inline (no first-class field in lint reports)', () => {
    const message = renderMessage(
      diagnostic({
        code: 'PFE9004',
        family: Family.PureFn,
        args: ['ns::fn'],
        related: [{filePath: '/first.ts', startLine: 2, startCol: 1, message: 'first registered here'}],
      })
    );
    expect(message).toContain('\n  related: /first.ts(2,1): first registered here');
  });

  it('never drops an unknown code — renders the regenerate-catalog fallback with the code prefix', () => {
    const message = renderMessage(diagnostic({code: 'ZZ999'}));
    expect(message).toBe('[ZZ999] (message unavailable — regenerate the catalog via `pnpm run gen:diag-catalog`)');
  });
});
