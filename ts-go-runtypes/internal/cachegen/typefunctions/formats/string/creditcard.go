package string

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// creditCardEmitter implements the format named "creditCard" — CreditCard in
// `ts-runtypes/formats`. Dispatches to pf_isCreditCard (digits + length + the
// Luhn checksum) and, ONLY when the format declares `networks`, additionally to
// pf_matchesCardNetwork (the per-network prefix / length table).
//
// That split is the whole design: the two pure fns have no dependency edge
// between them, so a bare `CreditCard` emits one call and the network table
// never reaches the consumer's bundle. Wiring them together on the JS side with
// `utl.getPureFn` would make the extractor record the table as a transitive dep
// of every call site — see the comment above the registrations in
// packages/run-types/src/formats/string/string-formats-pure-fns.ts.
type creditCardEmitter struct{}

func init() {
	formats.Register(creditCardEmitter{})
}

func (creditCardEmitter) Name() string                    { return "creditCard" }
func (creditCardEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// cardNetworks is the roster the `networks` param may name. Mirrors the
// CardNetwork union in stringFormats.ts and the NETWORK_RULES table in
// string-formats-pure-fns.ts — a name here with no rule there would validate
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

// creditCardCheckExpr builds the boolean validate expression: the base check
// always, ANDed with the network check only when networks are declared.
func creditCardCheckExpr(params map[string]any, vλl string, ctx formats.EmitContext) string {
	literal := cardParamsLiteral(params)
	check := pureFnAlias(ctx, "isCreditCard") + "(" + vλl + "," + literal + ")"
	networks, ok := readCardNetworks(params)
	if !ok || len(networks) == 0 {
		return check
	}
	return "(" + check + " && " + pureFnAlias(ctx, "matchesCardNetwork") + "(" + vλl + "," + literal + "))"
}

func (creditCardEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return creditCardCheckExpr(annotation.Params, vλl, ctx)
}

// EmitValidationErrorsCheck — a card number is one opaque "is or isn't a card
// this field takes" outcome, so one TypeFormatError carrying the `networks`
// param the caller declared (or `any` when it declared none).
func (creditCardEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	check := creditCardCheckExpr(annotation.Params, vλl, ctx)
	networks, ok := readCardNetworks(annotation.Params)
	value := jsquote.Double("any")
	if ok && len(networks) > 0 {
		value = jsValueLiteral(networks)
	}
	return "if (!(" + check + ")) " +
		formats.FormatErrCall(pathExpr, errorsArr, "string", "creditCard", "networks", value)
}

// EmitFormatTransform strips the declared separator characters so the
// transformed value is bare digits. Identity when the format takes none —
// there is nothing to strip and the value is already canonical.
func (creditCardEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	separators, ok := annotation.Params["separators"].(string)
	if !ok || separators == "" {
		return ""
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
	return vλl + ".replace(/[" + strings.Join(chars, "") + "]/g,'')"
}

// ValidateParams: every `networks` entry must name a known network, the list
// must not be empty, and `separators` must be a non-empty string carrying no
// digit (a digit separator could not be told from the number itself).
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
	if raw, present := annotation.Params["separators"]; present {
		separators, ok := raw.(string)
		if !ok || separators == "" {
			messages = append(messages, "FormatCreditCard: `separators` must be a non-empty string of separator characters")
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
