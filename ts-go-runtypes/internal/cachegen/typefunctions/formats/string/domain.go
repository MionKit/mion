package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// domainEmitter implements the format named "domain", FormatDomain / FormatDomainStrict, over two paths:
//
//   - pattern path: the type carries the domain regex, so one baked regex test plus length bounds.
//   - decomposition path: the type carries `names`/`tld` sub-formats, so the value is split on '.', each label
//     is validated as a sub-StringFormat, hyphen edges are rejected and the segment count bounded.
//
// validate emits the decomposition as an IIFE expression so it AND-chains after the base-kind check;
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

// EmitFormatTransform applies the declared `transform`; `{lowercase: true}` is the usual one for a domain.
func (domainEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return formats.EmitStringTransform(annotation.Params, vλl)
}

// ValidateParams: names/tld travel together, are mutually exclusive with pattern, and the bounds stay in range.
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
	errs = append(errs, formats.ValidateTransformParams(params, "FormatDomain")...)
	return errs
}

// domainHasNames reports whether the decomposition path applies; ValidateParams makes names/tld travel together.
func domainHasNames(params map[string]any) bool {
	_, ok := params["names"].(map[string]any)
	return ok
}

// ── IDNA path ────────────────────────────────────────────────────────
//
// A host name is not expressible as a pattern: an `xn--` label must be DECODED before its characters can be
// judged, re-encoded to prove the spelling is canonical, and the Bidi rule reads every label at once.
// So `idna` routes the whole check to isIdnHostname (string-formats-pure-fns.ts), with the declared length
// bounds AND-chained in front of it as the pattern path does.
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

// idnaCall returns the failure MODE, so "valid" is the empty string.
func idnaCall(ctx formats.EmitContext, params map[string]any, vλl string) string {
	return formats.PureFnAlias(ctx, purefnids.IsIdnHostname) + "(" + vλl + ",{idn:" + jsBool(idnaAllowsUnicode(params)) + "})"
}

func idnaCheckExpr(ctx formats.EmitContext, params map[string]any, vλl string) string {
	conditions := lengthConditions(params, vλl, ctx)
	conditions = append(conditions, idnaCall(ctx, params, vλl)+"===''")
	return strings.Join(conditions, " && ")
}

// idnaErrorsBlock: the IDNA path has FOUR ways to fail ('label', 'punycode', 'bidi', 'length') and the error
// names which in its `errorType`. One local, so the mode is computed once.
// A failing length bound folds in as 'length' rather than running the engine at all, and formatPath stays ['idna'].
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

// hasAllowedValues drives skipping the hyphen-edge label check: an explicit value set already pins the labels.
func hasAllowedValues(params map[string]any) bool {
	if params == nil {
		return false
	}
	_, ok := params["allowedValues"].(map[string]any)
	return ok
}

// domainValidateExprFor builds the decomposition validate IIFE over valExpr, the whole value at the root or the
// domain substring when reached from email.
// The bound `s` and the loop locals are arrow-scoped, so the fixed names cannot collide across sibling or
// nested domain checks.
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

// domainErrorsBlockFor builds the decomposition validationErrors block, accumulating rather than returning
// early, so every failing label or bound pushes onto errorsArr.
// count starts at 0 and is bumped once after the loop so it equals the segment count, labels plus tld.
// Its own `{ }` keeps the block locals scoped, which is what makes it safe under email nesting and sibling fields.
// Every part error names WHICH PART failed in its `errorType`: 'label' for a name label, 'tld' for the last one.
// The whole-name checks carry rootErrorType, "" from every caller today since formatPath already names a bound,
// kept as a parameter so a host can tag them.
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

// domainSubCheckExpr returns a domain validate EXPRESSION over valExpr, for the email emitter's domain half.
func domainSubCheckExpr(ctx formats.EmitContext, domainParams map[string]any, valExpr string) string {
	if domainHasNames(domainParams) {
		return domainValidateExprFor(ctx, domainParams, valExpr)
	}
	return strings.Join(stringConditions(ctx, domainParams, valExpr), " && ")
}

// domainSubErrorsStmts is the errors twin of domainSubCheckExpr; errorTypeExpr tags the whole-domain errors,
// "" today because the `domain` format name already says which half.
func domainSubErrorsStmts(ctx formats.EmitContext, domainParams map[string]any, valExpr, pathExpr, errorsArr, errorTypeExpr string) string {
	if domainHasNames(domainParams) {
		return domainErrorsBlockFor(ctx, domainParams, valExpr, pathExpr, errorsArr, errorTypeExpr)
	}
	return strings.Join(stringErrorStatements(ctx, domainParams, valExpr, pathExpr, errorsArr, "domain", errorTypeExpr), ";")
}
