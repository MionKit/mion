package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
)

// Hand-authored schemas — the roundtrip fuzz lane's blind spot.
//
// The lane only ever converts schemas the converter ITSELF wrote, so a door
// keyword a user can write but the converter never emits in that exact spelling
// is untested on the way back. That is how a `tsLabels` list which does not
// cover every slot shipped: the converter always writes the exact count, so
// nothing ever fed the mismatch back in. It refused with a symbol-keyed-member
// error naming `\xfe@iterator`, an Array member the author never wrote —
// because the projection fell through to the merged-property path and surfaced
// the tuple's Array interface as an object literal, while the id twin was
// already hashing the plain tuple.
//
// Every case here is written BY HAND from
// docs/json-schema-2020-12-javascript.md, converted on both value targets, and
// checked by the id oracle.

const schemaHead = "import {type InferType} from '@ts-runtypes/core';\n" +
	"import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';\n"

// handAuthored wraps a schema literal in the declaration pair the converter
// recognises.
func handAuthored(schema string) string {
	return schemaHead +
		"export const xRT = runTypeFromJsonSchema(" + schema + " as const);\n" +
		"export type X = InferType<typeof xRT>;\n"
}

// TestHandAuthored_EveryDialectKeyword — one hand-written schema per keyword in
// the dialect's summary table, plus the structural core keywords a user reaches
// for. Each must convert on BOTH value targets with no diagnostic and no id
// move.
func TestHandAuthored_EveryDialectKeyword(t *testing.T) {
	cases := map[string]string{
		"jsType":         `{type: 'string', format: 'date-time', jsType: 'Date'}`,
		"jsType-bigint":  `{type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'}`,
		"rtFormat":       `{type: 'string', format: 'email', rtFormat: 'email'}`,
		"rtFormatParams": `{type: 'array', items: {type: 'string'}, rtFormat: 'formattedArray', rtFormatParams: {minItems: 0}}`,
		"tsLabels":       `{type: 'array', prefixItems: [{type: 'number'}, {type: 'number'}], minItems: 2, items: false, tsLabels: ['x', 'y']}`,
		"tsReadonly":     `{type: 'object', properties: {id: {type: 'string'}, hits: {type: 'number'}}, required: ['id', 'hits'], tsReadonly: ['id']}`,
		"tsIndexes":      `{type: 'object', propertyNames: {pattern: '^(?:0|[1-9][0-9]*)$'}, tsIndexes: [{key: {type: 'number'}, value: {type: 'string'}}]}`,
		"tsTemplate":     `{type: 'string', pattern: '^api\\/.*\\/v[0-9]+(?:\\.[0-9]+)?$', tsTemplate: {texts: ['api/', '/v', ''], placeholders: [{type: 'string'}, {type: 'number'}]}}`,
		"tsFunction":     `{tsFunction: {params: {type: 'array', prefixItems: [{type: 'string'}], minItems: 1, items: false, tsLabels: ['message']}, return: {type: 'boolean'}}}`,
		"tsMeta":         `{tsMeta: {base: {type: 'string'}, meta: [{type: 'object', properties: {__brand: {const: 'UserId'}}, required: ['__brand'], tsReadonly: ['__brand']}]}}`,
		// The structural core keywords, which carry no dialect spelling but
		// reach the same collapse machinery.
		"not":               `{type: 'string', not: {format: 'email'}}`,
		"contains":          `{type: 'array', items: {type: 'number'}, contains: {const: 7}, minContains: 1}`,
		"patternProperties": `{type: 'object', patternProperties: {'^n_': {type: 'number'}}}`,
		"propertyNames":     `{type: 'object', propertyNames: {pattern: '^[a-z]+$'}}`,
		"minProperties":     `{type: 'object', properties: {a: {type: 'string'}}, required: ['a'], minProperties: 1}`,
		"oneOf":             `{oneOf: [{type: 'object', properties: {a: {type: 'string'}}, required: ['a']}, {type: 'object', properties: {b: {type: 'number'}}, required: ['b']}]}`,
		"selfRef":           `{type: 'object', properties: {kids: {type: 'array', items: {$ref: '#'}}}, required: ['kids']}`,
		// The unevaluated* keywords are NOT rows here: they refuse by design
		// (TestUnevaluatedSweep_RefusesInsteadOfDropping in
		// reviewfindings_test.go — docs/done/convert-drops-unevaluated.md).
	}
	// One row this coverage FOUND and did not fix — it has a filed spec, and
	// stays listed so the gap is visible rather than absent.
	open := map[string]string{
		"propertyNames": "docs/todos/propertynames-non-string-key-schema.md — a TYPELESS propertyNames subschema lowers to a union the value-first builder cannot carry",
	}
	for name, schema := range cases {
		t.Run(name, func(t *testing.T) {
			if reason, isOpen := open[name]; isOpen {
				t.Skip(reason)
			}
			source := handAuthored(schema)
			convertAndCheckIDsIn(t, fuzzSources(source), convert.TargetType)
			convertAndCheckIDsIn(t, fuzzSources(source), convert.TargetBuilders)
		})
	}
}

// TestHandAuthored_TypedPropertyNamesConverts — the propertyNames row above is
// open only for a TYPELESS subschema. Pinning the typed spellings keeps the
// filed defect narrow and stops the whole keyword regressing while it waits.
func TestHandAuthored_TypedPropertyNamesConverts(t *testing.T) {
	for name, schema := range map[string]string{
		"pattern":   `{type: 'object', propertyNames: {type: 'string', pattern: '^[a-z]+$'}}`,
		"minLength": `{type: 'object', propertyNames: {type: 'string', minLength: 2}}`,
		"enum":      `{type: 'object', propertyNames: {enum: ['a', 'b']}}`,
	} {
		t.Run(name, func(t *testing.T) {
			source := handAuthored(schema)
			convertAndCheckIDs(t, source, convert.TargetType)
			convertAndCheckIDs(t, source, convert.TargetBuilders)
		})
	}
}

// TestHandAuthored_TsLabelsCountMismatch — the defect this file was written
// for. `tsLabels` must cover every slot, the rest slot included, "or it is
// ignored whole" (docs/json-schema-2020-12-javascript.md → TS-LABELS). A count
// that does not cover drops the labels and leaves an ORDINARY tuple; it must
// never refuse, and it must never surface the tuple's Array interface as an
// object.
func TestHandAuthored_TsLabelsCountMismatch(t *testing.T) {
	// An open `prefixItems` with no `items` keyword has TWO slots — the prefix
	// element and the `unknown[]` rest — so a single label does not cover it.
	tooFew := handAuthored(`{type: 'array', prefixItems: [{type: 'number'}], tsLabels: ['x']}`)
	typeForm := convertAndCheckIDs(t, tooFew, convert.TargetType)
	if !strings.Contains(typeForm, "export type X = [number?, ...unknown[]];") {
		t.Errorf("a label list that does not cover every slot is ignored whole:\n%s", typeForm)
	}
	if strings.Contains(typeForm, "x:") {
		t.Errorf("a partial label list must not name SOME slots — TypeScript cannot express that:\n%s", typeForm)
	}

	// And one label too many, on a closed tuple.
	tooMany := handAuthored(`{type: 'array', prefixItems: [{type: 'number'}], minItems: 1, items: false, tsLabels: ['x', 'extra']}`)
	typeForm = convertAndCheckIDs(t, tooMany, convert.TargetType)
	if !strings.Contains(typeForm, "export type X = [number];") {
		t.Errorf("an over-long label list is ignored whole too:\n%s", typeForm)
	}

	// The covering counts still label, on both the closed and the open tuple —
	// the rest slot takes the last name.
	covered := handAuthored(`{type: 'array', prefixItems: [{type: 'number'}], minItems: 1, items: false, tsLabels: ['x']}`)
	typeForm = convertAndCheckIDs(t, covered, convert.TargetType)
	if !strings.Contains(typeForm, "export type X = [x: number];") {
		t.Errorf("a covering label list still names its slots:\n%s", typeForm)
	}
	coveredOpen := handAuthored(`{type: 'array', prefixItems: [{type: 'number'}], minItems: 1, tsLabels: ['x', 'rest']}`)
	typeForm = convertAndCheckIDs(t, coveredOpen, convert.TargetType)
	if !strings.Contains(typeForm, "export type X = [x: number, ...rest: unknown[]];") {
		t.Errorf("the rest slot takes the last label:\n%s", typeForm)
	}
}
