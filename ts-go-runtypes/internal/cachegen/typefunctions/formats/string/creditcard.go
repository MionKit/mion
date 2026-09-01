package string

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// creditCardEmitter implements the format named "creditCard" — CreditCard in
// `@mionjs/run-types/formats`. Dispatches to pf_isCreditCard (digits + length + the
// Luhn checksum) and, ONLY when the format declares `networks`, additionally to
// pf_matchesCardNetwork (the per-network prefix / length table).
//
// That split is the whole design: the two pure fns have no dependency edge
// between them, so a bare `CreditCard` emits one call and the network table
// never reaches the consumer's bundle. Wiring them together on the JS side with
// `utl.getPureFn` would make the extractor record the table as a transitive dep
// of every call site — see the comment above the registrations in
// packages/run-types/src/formats/string/credit-card-pure-fns.ts.
type creditCardEmitter struct{}

// creditCardPureFnFilePath is the canonical source path the resolver registers
// the card pure fns under. They live in their OWN module rather than beside the
// rest of the string formats — keep this in sync when either side moves.
const creditCardPureFnFilePath = "packages/run-types/src/formats/string/credit-card-pure-fns.ts"

// cardPureFnAlias is this format's own binding of the shared helper: same as the
// package-level pureFnAlias, but pointing at the card module.
func cardPureFnAlias(ctx formats.EmitContext, fnName string) string {
	return formats.PureFnAlias(ctx, fnName, creditCardPureFnFilePath)
}

func init() {
	formats.Register(creditCardEmitter{})
}

func (creditCardEmitter) Name() string                    { return "creditCard" }
func (creditCardEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// cardNetworks is the roster the `networks` param may name. Mirrors the
// CardNetwork union in stringFormats.ts and the NETWORK_RULES table in
// credit-card-pure-fns.ts — a name here with no rule there would validate
// nothing, so the three move together.
var cardNetworks = map[string]bool{
	"visa": true, "mastercard": true, "amex": true, "discover": true,
	"jcb": true, "diners": true, "unionpay": true, "maestro": true,
}

// readCardNetworks returns the declared networks in source order, and false when
// the param is absent or not a list. An EMPTY list is reported as present so
// ValidateParams can reject it: it would accept no card at all, which is never
// what a caller means.
func readCardNetworks(params map[string]any) ([]any, bool) {
	raw, ok := params["networks"]
	if !ok {
		return nil, false
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	return list, true
}

// cardParamsLiteral renders the params the pure fns actually read. Passing the
// whole annotation would fold mockSamples into every emitted call site for no
// runtime gain.
func cardParamsLiteral(params map[string]any) string {
	kept := map[string]any{}
	if networks, ok := readCardNetworks(params); ok {
		kept["networks"] = networks
	}
	if separators, ok := params["separators"].(string); ok && separators != "" {
		kept["separators"] = separators
	}
	return jsParamsLiteral(kept)
}

// creditCardCheckExpr builds the boolean validate expression. isCreditCard
// returns the FAILURE MODE, so "valid" is the empty string; the network check is
// ANDed in only when networks are declared.
func creditCardCheckExpr(params map[string]any, vλl string, ctx formats.EmitContext) string {
	literal := cardParamsLiteral(params)
	check := cardPureFnAlias(ctx, "isCreditCard") + "(" + vλl + "," + literal + ")===''"
	networks, ok := readCardNetworks(params)
	if !ok || len(networks) == 0 {
		return check
	}
	return "(" + check + " && " + cardPureFnAlias(ctx, "matchesCardNetwork") + "(" + vλl + "," + literal + "))"
}

func (creditCardEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return creditCardCheckExpr(annotation.Params, vλl, ctx)
}

// EmitValidationErrorsCheck — a card number has THREE ways to fail and a caller
// usually wants to say something different about each, so the error carries the
// mode in its `type`: 'format' (not shaped like a card number), 'checksum' (it
// is, but the digits do not add up — the mistyped-digit case) or 'network' (a
// good card, just not one this field takes).
//
// Emitted as a block with one local so the mode is computed once. The base call
// yields it directly; the network check is a boolean, so its mode is named here.
func (creditCardEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	literal := cardParamsLiteral(annotation.Params)
	mode := ctx.NextLocalVar("ccMode")
	// formatPath names the format itself here: the failing sub-constraint is not a
	// param, it is the shape or the checksum, and `type` is what says which.
	baseErr := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "creditCard", "creditCard",
		mode, formats.FormatErrorTypeProp(mode))
	block := "{const " + mode + "=" + cardPureFnAlias(ctx, "isCreditCard") + "(" + vλl + "," + literal + ");" +
		"if (" + mode + "!=='') " + baseErr

	networks, ok := readCardNetworks(annotation.Params)
	if !ok || len(networks) == 0 {
		return block + ";}"
	}
	networkErr := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "creditCard", "networks",
		jsValueLiteral(networks), formats.FormatErrorTypeProp(jsquote.Double("network")))
	return block + ";else if (!" + cardPureFnAlias(ctx, "matchesCardNetwork") + "(" + vλl + "," + literal + ")) " +
		networkErr + ";}"
}

// EmitFormatTransform strips the declared separator characters so the value is
// bare digits, ONLY when the format asked for it with
// `transform: {stripSeparators: true}`, then applies the shared string rewrites
// on top. Accepting the grouping someone typed and rewriting it are two
// different decisions, so the second one is opt-in; identity otherwise. The
// strip runs FIRST so a later `trim` sees the stripped value (a leading `-`
// followed by a tab would otherwise leave the tab for a second pass to remove).
func (creditCardEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	transform := formats.ReadTransformParams(annotation.Params)
	strip, _ := formats.ReadBoolParam(transform, "stripSeparators")
	separators, hasSeparators := annotation.Params["separators"].(string)
	if !strip || !hasSeparators || separators == "" {
		return formats.EmitStringTransform(annotation.Params, vλl)
	}
	// A character class over the declared set, deduped and sorted so the same
	// declaration always emits the same regex regardless of spelling order.
	seen := map[rune]bool{}
	for _, char := range separators {
		seen[char] = true
	}
	chars := make([]string, 0, len(seen))
	for char := range seen {
		chars = append(chars, regexpEscape(string(char)))
	}
	sort.Strings(chars)
	stripCall := ".replace(/[" + strings.Join(chars, "") + "]/g,'')"
	if chained := formats.EmitStringTransformAfter(annotation.Params, vλl, stripCall); chained != "" {
		return chained
	}
	return vλl + stripCall
}

// ValidateParams: every `networks` entry must name a known network, the list
// must not be empty, and `separators` must be a string carrying no digit (a
// digit separator could not be told from the number itself). The EMPTY string
// is valid there — it is the digits-only opt-out from the ' -' default.
func (creditCardEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	var messages []string
	if raw, present := annotation.Params["networks"]; present {
		list, ok := raw.([]any)
		if !ok {
			messages = append(messages, "FormatCreditCard: `networks` must be a list of network names")
		} else if len(list) == 0 {
			messages = append(messages, "FormatCreditCard: `networks` must name at least one network — omit it to accept any")
		} else {
			for _, entry := range list {
				name, isString := entry.(string)
				if !isString || !cardNetworks[name] {
					messages = append(messages, "FormatCreditCard: unknown `networks` entry — must be one of "+cardNetworkNames())
					break
				}
			}
		}
	}
	messages = append(messages, formats.ValidateTransformParams(annotation.Params, "FormatCreditCard", "stripSeparators")...)
	if strip, _ := formats.ReadBoolParam(formats.ReadTransformParams(annotation.Params), "stripSeparators"); strip {
		// Asking to strip when nothing is accepted is a config mistake, not a
		// harmless no-op: the author expected a rewrite that can never happen.
		separators, hasSeparators := annotation.Params["separators"].(string)
		if hasSeparators && separators == "" {
			messages = append(messages,
				"FormatCreditCard: `transform.stripSeparators` needs separators to strip — it does nothing with `separators: ''`")
		}
	}
	if raw, present := annotation.Params["separators"]; present {
		// The empty string is the OPT-OUT, not a mistake: the format defaults to
		// ' -', so `separators: ''` is the only way to say digits and nothing else.
		separators, ok := raw.(string)
		if !ok {
			messages = append(messages, "FormatCreditCard: `separators` must be a string of separator characters ('' for digits only)")
		} else if strings.ContainsAny(separators, "0123456789") {
			messages = append(messages, "FormatCreditCard: `separators` must not contain a digit")
		}
	}
	return messages
}

// cardNetworkNames renders the roster for an error message, sorted so the text
// is stable across runs.
func cardNetworkNames() string {
	names := make([]string, 0, len(cardNetworks))
	for name := range cardNetworks {
		names = append(names, "'"+name+"'")
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}
