package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// A `CompTimeArgs` parameter handed straight into another CompTimeArgs position
// is a FORWARD, not a value to read. The library's own `optional(field)` does
// exactly that (it calls `propMod({optional: true}, field)`) and used to need a
// suppression comment, and so did every consumer wrapper over any builder.
//
// The value is still demanded exactly once: it arrives from the wrapper's own
// call sites, and each of those is walked and checked at its outer CompTimeArgs
// position. The tests below pin that the acceptance is that narrow — a
// parameter that is NOT CompTimeArgs-annotated, and every other non-literal
// shape, stay rejected.

// TestCompTimeArgsForward_WrapperParamAccepted is the finding's regression test.
func TestCompTimeArgsForward_WrapperParamAccepted(t *testing.T) {
	const code = `import type {CompTimeArgs} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

function myOptional<const F>(field: CompTimeArgs<F>) {
  return RT.propMod({optional: true}, field);
}
const Model = RT.object({nick: myOptional(TF.string({maxLength: 8}))});
void Model;
`
	if cta := scanFormatPatternCTA(t, code); len(cta) != 0 {
		t.Fatalf("a forwarded CompTimeArgs parameter must be accepted, got %d: %+v", len(cta), cta)
	}
}

// The acceptance is keyed on the parameter's OWN annotation. A plain `string`
// parameter forwarded into a CompTimeArgs slot carries no such promise: nothing
// checks it at the wrapper's call sites, so the value really would be lost and
// it stays CTA001.
func TestCompTimeArgsForward_PlainParamRejected(t *testing.T) {
	const code = `import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

export function withMax(opts: {maxLength: number}) {
  return RT.object({nick: TF.string(opts)});
}
`
	cta := scanFormatPatternCTA(t, code)
	if len(cta) != 1 || cta[0].Code != diagnostics.CodeCompTimeArgsNonLiteral {
		t.Fatalf("expected 1 CTA001 for a plain object parameter, got %d: %+v", len(cta), cta)
	}
}

// A `let` binding is not a forward and not a const: it stays rejected, so the
// narrowing did not soften the ordinary identifier rule.
func TestCompTimeArgsForward_LetBindingStillRejected(t *testing.T) {
	const code = `import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

let loose = {maxLength: 8};
const Model = RT.object({nick: TF.string(loose)});
void Model;
`
	cta := scanFormatPatternCTA(t, code)
	if len(cta) != 1 || cta[0].Code != diagnostics.CodeCompTimeArgsNonLiteral {
		t.Fatalf("expected 1 CTA001 for a `let` binding, got %d: %+v", len(cta), cta)
	}
}

// A user's own type happens to be named CompTimeArgs. The check resolves the
// annotation through its import alias and requires the marker package's
// declaring module, so this earns nothing.
func TestCompTimeArgsForward_UserAliasEarnsNothing(t *testing.T) {
	const helpers = `export type CompTimeArgs<T> = T;
`
	const code = `import type {CompTimeArgs} from './helpers.ts';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

export function withMax(opts: CompTimeArgs<{maxLength: number}>) {
  return RT.object({nick: TF.string(opts)});
}
`
	cta := scanFormatPatternCTA2(t, map[string]string{"helpers.ts": helpers, "test.ts": code})
	if len(cta) != 1 || cta[0].Code != diagnostics.CodeCompTimeArgsNonLiteral {
		t.Fatalf("a user's own CompTimeArgs alias must earn nothing, got %d: %+v", len(cta), cta)
	}
}
