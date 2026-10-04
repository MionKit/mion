// Unit tests of the transport-agnostic routing layer: wire diagnostic →
// {rule, message, loc}. Pure mapping — no binary, no worker.

import {describe, expect, it} from 'vitest';
import {anchoredIn, routeDiagnostic, renderMessage, RULE_SPECS, type RuleName} from '../../src/lint/diagnosticRouting.ts';
import {DIAGNOSTIC_CATALOG} from '../../src/core/diagnosticCatalog.ts';
import {Family, Level, Severity, type Diagnostic} from '../../src/core/protocol.ts';

function diagnostic(partial: Partial<Diagnostic> & {code: string}): Diagnostic {
  return {
    family: Family.RunType,
    severity: Severity.Warning,
    level: Level.Warning,
    site: {filePath: 'a.ts', startLine: 3, startCol: 5},
    ...partial,
  } as Diagnostic;
}

const ruleOf = (partial: Partial<Diagnostic> & {code: string}) => routeDiagnostic(diagnostic(partial)).ruleName;

describe('level routing (one rule per level, never per topic)', () => {
  it('sends Error to mion/error and RuntimeError to mion/runtime-error, whatever the family', () => {
    expect(ruleOf({code: 'marker-in-generic-function', family: Family.Marker, level: Level.Error})).toBe('error');
    expect(ruleOf({code: 'enrich-text-reserved-prefix', family: Family.Enrich, level: Level.Error})).toBe('error');
    expect(ruleOf({code: 'validate-symbol-root', level: Level.RuntimeError})).toBe('runtime-error');
    expect(ruleOf({code: 'rpc-handler-missing-return-type', family: Family.MionRoute, level: Level.RuntimeError})).toBe(
      'runtime-error'
    );
  });

  it('sends Warning to mion/warning and Info to mion/info', () => {
    expect(ruleOf({code: 'unknown-keys-function-shared', level: Level.Warning})).toBe('warning');
    expect(ruleOf({code: 'enrich-text-todo-left', family: Family.Enrich, level: Level.Warning})).toBe('warning');
    expect(ruleOf({code: 'rpc-handler-non-data-property', family: Family.MionRoute, level: Level.Warning})).toBe('warning');
    expect(ruleOf({code: 'validate-method-dropped', level: Level.Info})).toBe('info');
  });

  it('sends a downgraded finding to mion/warning, with the build note', () => {
    const report = routeDiagnostic(diagnostic({code: 'validate-symbol-root', level: Level.RuntimeError, downgraded: true}));
    expect(report.ruleName).toBe('warning');
    expect(report.message).toMatch(/^\[validate-symbol-root\] .*\(downgraded\)$/);
  });

  it('keeps the stable code in the message for lookup and directive comments', () => {
    const report = routeDiagnostic(diagnostic({code: 'validate-method-dropped', args: ['onClick']}));
    expect(report.message).toContain('[validate-method-dropped]');
    expect(report.message).toContain('onClick');
  });

  it('never drops a diagnostic: an unknown code reports at its wire level', () => {
    expect(ruleOf({code: 'ZZ999', level: Level.RuntimeError})).toBe('runtime-error');
    expect(ruleOf({code: 'ZZ999', level: Level.Warning})).toBe('warning');
  });
});

// Go↔JS drift guard: every catalog level routes to its rule, at the default the build uses for that level.
describe('catalog coverage: every code routes to the rule of its level', () => {
  const RULE_DEFAULT = new Map<RuleName, string>(RULE_SPECS.map((spec) => [spec.name, spec.default]));
  const levelEnum = {error: Level.Error, runtimeError: Level.RuntimeError, warning: Level.Warning, info: Level.Info} as const;
  const expected = {
    error: ['error', 'error'],
    runtimeError: ['runtime-error', 'error'],
    warning: ['warning', 'warn'],
    info: ['info', 'off'],
  } as const;

  it('maps every catalog code to the rule of its level, at the default the build implies', () => {
    const codes = Object.keys(DIAGNOSTIC_CATALOG);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const entry = DIAGNOSTIC_CATALOG[code]!;
      const routed = ruleOf({code, level: levelEnum[entry.level]});
      const [rule, ruleDefault] = expected[entry.level];
      expect(routed, `${code} is a ${entry.level}`).toBe(rule);
      expect(RULE_DEFAULT.get(routed)).toBe(ruleDefault);
    }
  });
});

describe('anchoredIn: only the linted file findings are reported', () => {
  it('keeps a finding anchored in the linted file, however its path is spelled', () => {
    expect(
      anchoredIn(
        diagnostic({code: 'validate-symbol-root', site: {filePath: 'src/a.ts', startLine: 1, startCol: 1}}),
        `${process.cwd()}/src/a.ts`
      )
    ).toBe(true);
  });

  it('drops a finding anchored in another file, or in no file', () => {
    expect(
      anchoredIn(diagnostic({code: 'override-duplicate', site: {filePath: '/p/b.ts', startLine: 4, startCol: 1}}), '/p/a.ts')
    ).toBe(false);
    expect(
      anchoredIn(diagnostic({code: 'rpc-batch-router-init-hidden', site: {filePath: '', startLine: 0, startCol: 0}}), '/p/a.ts')
    ).toBe(false);
  });
});

describe('location conversion', () => {
  it('converts 1-based wire columns to 0-based loc columns and keeps 1-based lines', () => {
    const report = routeDiagnostic(
      diagnostic({
        code: 'enrich-text-todo-left',
        family: Family.Enrich,
        site: {filePath: 'm.ts', startLine: 5, startCol: 4, endLine: 5, endCol: 9},
      })
    );
    expect(report.loc).toEqual({start: {line: 5, column: 3}, end: {line: 5, column: 8}});
  });

  it('emits a start-only loc when the wire site has no end (runtype-family sites)', () => {
    const report = routeDiagnostic(
      diagnostic({code: 'validate-method-dropped', site: {filePath: 'a.ts', startLine: 8, startCol: 48}})
    );
    expect(report.loc).toEqual({start: {line: 8, column: 47}});
  });

  it('clamps a degenerate site to 1:0 so the report still lands in the file', () => {
    const report = routeDiagnostic(
      diagnostic({code: 'validate-method-dropped', site: {filePath: 'a.ts', startLine: 0, startCol: 0}})
    );
    expect(report.loc.start).toEqual({line: 1, column: 0});
  });
});

describe('message rendering', () => {
  it('substitutes positional args through the catalog headline', () => {
    const message = renderMessage(diagnostic({code: 'enrich-text-unknown-field', family: Family.Enrich, args: ['nope']}));
    expect(message).toBe(
      '[enrich-text-unknown-field] Unknown field `nope`: the type does not declare it, so this FriendlyText entry is dead.'
    );
  });

  it('appends related locations inline (no first-class field in lint reports)', () => {
    const message = renderMessage(
      diagnostic({
        code: 'purefn-artifact-conflict',
        family: Family.PureFn,
        args: ['ns::fn'],
        related: [{filePath: '/first.ts', startLine: 2, startCol: 1, message: 'first registered here'}],
      })
    );
    expect(message).toContain('\n  related: /first.ts(2,1): first registered here');
  });

  it('never drops an unknown code — renders the regenerate-catalog fallback with the code prefix', () => {
    const message = renderMessage(diagnostic({code: 'ZZ999'}));
    expect(message).toBe('[ZZ999] (message unavailable — regenerate the catalog via `pnpm miondevx core codegen diag`)');
  });
});
