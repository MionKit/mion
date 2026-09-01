package string

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// domainEmitter implements the format named "domain" — FormatDomain /
// FormatDomainStrict. Two validation paths, mirroring the
// DomainRunTypeFormat:
//
//   - pattern path: the type carries the domain regex (FormatDomain) —
//     a single baked regex test + length bounds (namedPattern*).
//   - decomposition path: the type carries `names`/`tld` sub-formats
//     (FormatDomainStrict) — the value is split on '.', each label is
//     validated as a sub-StringFormat, label hyphen-edges are rejected,
//     and the segment count is bounded by maxParts/minParts.
//
// validate emits the decomposition as an IIFE expression (same splice
// shape as datetime.go) so it AND-chains after the base-kind check;
// validationErrors emits an error-accumulating statement block.
type domainEmitter struct{}

func init() {
	formats.Register(domainEmitter{})
}

func (domainEmitter) Name() string                    { return "domain" }
func (domainEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

func (domainEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation != nil && domainHasNames(annotation.Params) {
		return domainValidateExprFor(ctx, annotation.Params, vλl)
	}
	if annotation != nil && domainHasIdna(annotation.Params) {
		return idnaCheckExpr(ctx, annotation.Params, vλl)
	}
	return namedPatternValidate(ctx, annotation, vλl)
}

func (domainEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation != nil && domainHasNames(annotation.Params) {
		return domainErrorsBlockFor(ctx, annotation.Params, vλl, pathExpr, errorsArr, "")
	}
	if annotation != nil && domainHasIdna(annotation.Params) {
		return idnaErrorsBlock(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "domain")
}

// EmitFormatTransform lowercases the domain (ref: domain.runtype.ts:229
// — all domains are case-insensitive, canonicalised to lower case).
func (domainEmitter) EmitFormatTransform(_ *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}

// ValidateParams ports DomainRunTypeFormat.validateParams
// (ref: domain.runtype.ts:235-248): names/tld travel together, are mutually
// exclusive with pattern, and the length/part bounds stay in range.
func (domainEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	_, hasNames := params["names"].(map[string]any)
	_, hasTld := params["tld"].(map[string]any)
	_, hasPattern := params["pattern"]
	if hasNames != hasTld {
		errs = append(errs, "FormatDomain: `names` and `tld` must be used together")
	}
	if (hasNames || hasTld) && hasPattern {
		errs = append(errs, "FormatDomain: cannot combine `pattern` with `names`/`tld`")
	}
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok && value > 253 {
		errs = append(errs, "FormatDomain: `maxLength` cannot be greater than 253")
	}
	if value, ok := formats.ReadNumberParam(params, "maxParts"); ok && value < 2 {
		errs = append(errs, "FormatDomain: `maxParts` cannot be less than 2")
	}
	if value, ok := formats.ReadNumberParam(params, "minParts"); ok && value < 2 {
		errs = append(errs, "FormatDomain: `minParts` cannot be less than 2")
	}
	return errs
}

// domainHasNames reports whether the decomposition path applies — i.e.
// the params carry a `names` sub-format object (names/tld come together,
// validateParams enforces it).
func domainHasNames(params map[string]any) bool {
	_, ok := params["names"].(map[string]any)
	return ok
}

// ── IDNA path ────────────────────────────────────────────────────────
//
// A host name is not expressible as a pattern: an `xn--` label must be DECODED
// before its characters can be judged, re-encoded to prove the spelling is
// canonical, and the Bidi rule reads every label at once. So the `idna` param
// routes the whole check to the pure-fn engine
// (rtFormats::isIdnHostname and its deps in string-formats-pure-fns.ts), with
// the declared length bounds AND-chained in front of it exactly as the pattern
// path does.
//
//   idna: 'ascii'    → `format: 'hostname'`, RFC 1123 labels, A-labels decoded
//   idna: 'unicode'  → `format: 'idn-hostname'`, U-labels accepted directly

func domainHasIdna(params map[string]any) bool {
	mode, ok := params["idna"].(string)
	return ok && mode != ""
}

func idnaAllowsUnicode(params map[string]any) bool {
	mode, _ := params["idna"].(string)
	return mode == "unicode"
}

func jsBool(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

// idnaCall is the pure-fn call: it returns the failure MODE, so "valid" is the
// empty string and validate compares against it.
func idnaCall(ctx formats.EmitContext, params map[string]any, vλl string) string {
	return pureFnAlias(ctx, "isIdnHostname") + "(" + vλl + ",{idn:" + jsBool(idnaAllowsUnicode(params)) + "})"
}

func idnaCheckExpr(ctx formats.EmitContext, params map[string]any, vλl string) string {
	conditions := lengthConditions(params, vλl, ctx)
	conditions = append(conditions, idnaCall(ctx, params, vλl)+"===''")
	return strings.Join(conditions, " && ")
}

// idnaErrorsBlock — the IDNA path has FOUR ways to fail (see isIdnHostname:
// 'label', 'punycode', 'bidi', 'length'), and the error names which in its
// `errorType`. One local so the mode is computed once; a declared length bound
// that fails folds in as 'length' rather than running the engine at all.
// formatPath stays ['idna'], so nothing keyed off it changes.
func idnaErrorsBlock(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr string) string {
	mode := ctx.NextLocalVar("dnMode")
	init := idnaCall(ctx, params, vλl)
	if conditions := lengthConditions(params, vλl, ctx); len(conditions) > 0 {
		init = "(" + strings.Join(conditions, " && ") + ") ? " + init + " : 'length'"
	}
	errCall := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "domain", "idna",
		jsBool(idnaAllowsUnicode(params)), formats.FormatErrorTypeProp(mode))
	return "{const " + mode + "=" + init + ";if (" + mode + "!=='') " + errCall + ";}"
}

// hasAllowedValues reports whether a sub-param map has an allowedValues
// param. We skip the hyphen-edge label check when names is an
// enum (allowedValues) — the explicit value set already pins the labels.
func hasAllowedValues(params map[string]any) bool {
	if params == nil {
		return false
	}
	_, ok := params["allowedValues"].(map[string]any)
	return ok
}

// domainValidateExprFor builds the decomposition validate IIFE for a domain
// applied to valExpr (the whole value at the root, or the domain
// substring when reached from email). Mirrors domain.runtype.ts:
// 101-116. Returns an expression evaluating to true iff valExpr is a
// well-formed domain under params. The bound `s` plus the loop locals
// (count/start/pos/name/tld) are arrow-scoped, so fixed names can't
// collide across sibling or nested domain checks.
func domainValidateExprFor(ctx formats.EmitContext, params map[string]any, valExpr string) string {
	namesParams, _ := params["names"].(map[string]any)
	tldParams, _ := params["tld"].(map[string]any)

	rootConds := strings.Join(stringConditions(ctx, params, "s"), " && ")
	nameConds := strings.Join(stringConditions(ctx, namesParams, "name"), " && ")
	tldConds := strings.Join(stringConditions(ctx, tldParams, "tld"), " && ")

	var b strings.Builder
	b.WriteString("((s) => {")
	if rootConds != "" {
		b.WriteString("if (!(" + rootConds + ")) return false;")
	}
	b.WriteString("let count = 1, start = 0, pos, name;")
	b.WriteString("while ((pos = s.indexOf('.', start)) !== -1) {")
	b.WriteString("name = s.substring(start, pos);")
	if !hasAllowedValues(namesParams) {
		b.WriteString("if (name.startsWith('-') || name.endsWith('-')) return false;")
	}
	if nameConds != "" {
		b.WriteString("if (!(" + nameConds + ")) return false;")
	}
	b.WriteString("start = pos + 1; count++;")
	b.WriteString("}")
	if maxParts, ok := formats.ReadNumberParam(params, "maxParts"); ok {
		b.WriteString("if (count > " + formats.FormatNumber(maxParts) + ") return false;")
	}
	if minParts, ok := formats.ReadNumberParam(params, "minParts"); ok {
		b.WriteString("if (count < " + formats.FormatNumber(minParts) + ") return false;")
	}
	b.WriteString("const tld = s.substring(start);")
	if tldConds != "" {
		b.WriteString("if (!(" + tldConds + ")) return false;")
	}
	b.WriteString("return true;")
	b.WriteString("})(" + valExpr + ")")
	return b.String()
}

// domainErrorsBlockFor builds the decomposition validationErrors statement
// block (ref: domain.runtype.ts:145-159). Error-accumulating (no early
// returns): every failing label / bound pushes onto errorsArr. count
// starts at 0 and is bumped once post-loop so it equals the segment
// count (labels + tld). Wrapped in its own `{ }` so the block locals
// stay scoped — safe under email nesting and sibling domain fields.
//
// Every part error names WHICH PART failed in its `errorType`: 'label' for a
// name label (the hyphen-edge check included), 'tld' for the last one. The
// whole-name checks (root length bounds, maxParts / minParts) carry
// rootErrorType, "" from every caller today — formatPath already names a
// bound — kept as a parameter so a host can tag them.
func domainErrorsBlockFor(ctx formats.EmitContext, params map[string]any, valExpr, pathExpr, errorsArr, rootErrorType string) string {
	namesParams, _ := params["names"].(map[string]any)
	tldParams, _ := params["tld"].(map[string]any)

	rootErrs := strings.Join(stringErrorStatements(ctx, params, "s", pathExpr, errorsArr, "domain", rootErrorType), ";")
	nameErrs := strings.Join(stringErrorStatements(ctx, namesParams, "name", pathExpr, errorsArr, "domain", jsquote.Double("label")), ";")
	tldErrs := strings.Join(stringErrorStatements(ctx, tldParams, "tld", pathExpr, errorsArr, "domain", jsquote.Double("tld")), ";")

	var b strings.Builder
	b.WriteString("{const s = " + valExpr + ";")
	if rootErrs != "" {
		b.WriteString(rootErrs + ";")
	}
	b.WriteString("let count = 0, start = 0, pos, name;")
	b.WriteString("while ((pos = s.indexOf('.', start)) !== -1) {")
	b.WriteString("name = s.substring(start, pos);")
	if !hasAllowedValues(namesParams) {
		b.WriteString("if (name.startsWith('-') || name.endsWith('-')) " +
			formatErrWithType(pathExpr, errorsArr, "domain", "hyphen", "'name'", jsquote.Double("label")) + ";")
	}
	if nameErrs != "" {
		b.WriteString(nameErrs + ";")
	}
	b.WriteString("start = pos + 1; count++;")
	b.WriteString("}")
	b.WriteString("count++;")
	if maxParts, ok := formats.ReadNumberParam(params, "maxParts"); ok {
		b.WriteString("if (count > " + formats.FormatNumber(maxParts) + ") " +
			formatErrWithType(pathExpr, errorsArr, "domain", "maxParts", formats.FormatNumber(maxParts), rootErrorType) + ";")
	}
	if minParts, ok := formats.ReadNumberParam(params, "minParts"); ok {
		b.WriteString("if (count < " + formats.FormatNumber(minParts) + ") " +
			formatErrWithType(pathExpr, errorsArr, "domain", "minParts", formats.FormatNumber(minParts), rootErrorType) + ";")
	}
	b.WriteString("const tld = s.substring(start);")
	if tldErrs != "" {
		b.WriteString(tldErrs + ";")
	}
	b.WriteString("}")
	return b.String()
}

// domainSubCheckExpr returns a domain validate EXPRESSION over valExpr,
// dispatching on whether the domain params use the names/tld
// decomposition (IIFE) or the pattern/length path (AND of conditions).
// Used by the email emitter to validate the domain half of an address.
func domainSubCheckExpr(ctx formats.EmitContext, domainParams map[string]any, valExpr string) string {
	if domainHasNames(domainParams) {
		return domainValidateExprFor(ctx, domainParams, valExpr)
	}
	return strings.Join(stringConditions(ctx, domainParams, valExpr), " && ")
}

// domainSubErrorsStmts returns domain validationErrors STATEMENTS over
// valExpr, dispatching the same way as domainSubCheckExpr. Used by the
// email emitter; errorTypeExpr tags the whole-domain errors ("" today: the
// `domain` format name already says which half, and the label / tld errors
// name themselves).
func domainSubErrorsStmts(ctx formats.EmitContext, domainParams map[string]any, valExpr, pathExpr, errorsArr, errorTypeExpr string) string {
	if domainHasNames(domainParams) {
		return domainErrorsBlockFor(ctx, domainParams, valExpr, pathExpr, errorsArr, errorTypeExpr)
	}
	return strings.Join(stringErrorStatements(ctx, domainParams, valExpr, pathExpr, errorsArr, "domain", errorTypeExpr), ";")
}
