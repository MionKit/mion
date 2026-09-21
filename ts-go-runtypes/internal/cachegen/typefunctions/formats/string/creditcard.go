package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// creditCardEmitter implements the format named "creditCard": isCreditCard (digits + length + Luhn) and, ONLY
// when the format declares `networks`, matchesCardNetwork (the per-network prefix / length table).
// The two pure fns deliberately have NO dependency edge between them, so a bare `CreditCard` emits one call and
// the network table never reaches the consumer's bundle; wiring them together with `utl.getPureFn` would make the
// extractor record the table as a transitive dep of every call site.
// See the registrations in packages/run-types/src/formats/string/credit-card-pure-fns.ts.
type creditCardEmitter struct{}

// cardPureFnAlias is this format's own binding of formats.PureFnAlias, pointing at the card module.
func cardPureFnAlias(ctx formats.EmitContext, id string) string {
	return formats.PureFnAlias(ctx, id)
}

func init() {
	formats.Register(creditCardEmitter{})
}

func (creditCardEmitter) Name() string                    { return "creditCard" }
func (creditCardEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// cardNetworks is the roster the `networks` param may name, mirroring the CardNetwork union and the
// NETWORK_RULES table in credit-card-pure-fns.ts: a name here with no rule there would validate nothing.
var cardNetworks = map[string]bool{
	"visa": true, "mastercard": true, "amex": true, "discover": true,
	"jcb": true, "diners": true, "unionpay": true, "maestro": true,
}

// readCardNetworks returns the declared networks in source order.
// An EMPTY list is reported as present so ValidateParams can reject it: it would accept no card at all.
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

// cardParamsLiteral renders only the params the pure fns read; the whole annotation would fold mockSamples into
// every emitted call site for no runtime gain.
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

// creditCardCheckExpr builds the boolean validate expression; isCreditCard returns the FAILURE MODE, so "valid"
// is the empty string.
func creditCardCheckExpr(params map[string]any, vλl string, ctx formats.EmitContext) string {
	literal := cardParamsLiteral(params)
	check := cardPureFnAlias(ctx, purefnids.IsCreditCard) + "(" + vλl + "," + literal + ")===''"
	networks, ok := readCardNetworks(params)
	if !ok || len(networks) == 0 {
		return check
	}
	return "(" + check + " && " + cardPureFnAlias(ctx, purefnids.MatchesCardNetwork) + "(" + vλl + "," + literal + "))"
}

func (creditCardEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return creditCardCheckExpr(annotation.Params, vλl, ctx)
}

// EmitValidationErrorsCheck: a card number has THREE ways to fail, so the error carries the mode in its
// `errorType`: 'format' (not shaped like a card number), 'checksum' (the mistyped-digit case) or 'network'
// (a good card, just not one this field takes).
// One block with one local, so the mode is computed once; the network check is a boolean, so its mode is named here.
func (creditCardEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	literal := cardParamsLiteral(annotation.Params)
	mode := ctx.NextLocalVar("ccMode")
	// formatPath names the format itself: the failing sub-constraint is the shape or the checksum, not a param,
	// and `errorType` is what says which.
	baseErr := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "creditCard", "creditCard",
		mode, formats.FormatErrorTypeProp(mode))
	block := "{const " + mode + "=" + cardPureFnAlias(ctx, purefnids.IsCreditCard) + "(" + vλl + "," + literal + ");" +
		"if (" + mode + "!=='') " + baseErr

	networks, ok := readCardNetworks(annotation.Params)
	if !ok || len(networks) == 0 {
		return block + ";}"
	}
	networkErr := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "creditCard", "networks",
		jsValueLiteral(networks), formats.FormatErrorTypeProp(jsquote.Double("network")))
	return block + ";else if (!" + cardPureFnAlias(ctx, purefnids.MatchesCardNetwork) + "(" + vλl + "," + literal + ")) " +
		networkErr + ";}"
}

// EmitFormatTransform strips the declared separator characters, ONLY under `transform: {stripSeparators: true}`,
// then applies the shared rewrites: accepting the grouping someone typed and rewriting it are two decisions, so
// the second is opt-in.
// The strip runs FIRST so a later `trim` sees the stripped value, or a leading `-` could uncover a tab that only
// a second pass would remove.
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
	// Deduped and sorted, so the same declaration emits the same regex whatever order it was spelled in.
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

// ValidateParams: `networks` must be a non-empty list of known names, and `separators` a string with no digit,
// which could not be told from the number itself. The EMPTY string is the digits-only opt-out from the ' -' default.
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
		// Not a harmless no-op: the author expected a rewrite that can never happen.
		separators, hasSeparators := annotation.Params["separators"].(string)
		if hasSeparators && separators == "" {
			messages = append(messages,
				"FormatCreditCard: `transform.stripSeparators` needs separators to strip — it does nothing with `separators: ''`")
		}
	}
	if raw, present := annotation.Params["separators"]; present {
		// The empty string is the OPT-OUT: the format defaults to ' -', so it is the only way to say digits only.
		separators, ok := raw.(string)
		if !ok {
			messages = append(messages, "FormatCreditCard: `separators` must be a string of separator characters ('' for digits only)")
		} else if strings.ContainsAny(separators, "0123456789") {
			messages = append(messages, "FormatCreditCard: `separators` must not contain a digit")
		}
	}
	return messages
}

// cardNetworkNames renders the roster for an error message, sorted so the text is stable across runs.
func cardNetworkNames() string {
	names := make([]string, 0, len(cardNetworks))
	for name := range cardNetworks {
		names = append(names, "'"+name+"'")
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}
