package string

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// emailEmitter implements the format named "email" — FormatEmail /
// FormatEmailStrict. Like domain it has two paths (the
// EmailRunTypeFormat):
//
//   - pattern path: a single baked email regex (FormatEmail).
//   - decomposition path: split on the LAST '@' into localPart + domain
//     (FormatEmailStrict); localPart is validated as a sub-StringFormat
//     and domain as a sub-domain (which may itself decompose).
//
// validate emits an IIFE expression; validationErrors emits a statement block.
type emailEmitter struct{}

func init() {
	formats.Register(emailEmitter{})
}

func (emailEmitter) Name() string                    { return "email" }
func (emailEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

func (emailEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailValidateExprFor(ctx, annotation.Params, vλl)
	}
	if annotation != nil && emailHasRfc(annotation.Params) {
		return emailRfcCheckExpr(ctx, annotation.Params, vλl)
	}
	return namedPatternValidate(ctx, annotation, vλl)
}

// ── RFC 5321 path ────────────────────────────────────────────────────
//
// `emailRfc` routes the whole check to the pure-fn engine: a quoted local part
// and an address-literal domain are not expressible as a pattern. 'ascii' backs
// `format: 'email'`, 'unicode' backs `format: 'idn-email'`.

func emailHasRfc(params map[string]any) bool {
	mode, ok := params["emailRfc"].(string)
	return ok && mode != ""
}

func emailRfcAllowsUnicode(params map[string]any) bool {
	mode, _ := params["emailRfc"].(string)
	return mode == "unicode"
}

// emailRfcCall is the pure-fn call: it returns the failure MODE, so "valid" is
// the empty string and validate compares against it.
func emailRfcCall(ctx formats.EmitContext, params map[string]any, vλl string) string {
	idn := "false"
	if emailRfcAllowsUnicode(params) {
		idn = "true"
	}
	return pureFnAlias(ctx, "isEmailAddress") + "(" + vλl + ",{idn:" + idn + "})"
}

func emailRfcCheckExpr(ctx formats.EmitContext, params map[string]any, vλl string) string {
	conditions := lengthConditions(params, vλl, ctx)
	conditions = append(conditions, emailRfcCall(ctx, params, vλl)+"===''")
	return strings.Join(conditions, " && ")
}

// emailRfcErrorsBlock — the RFC path names WHICH PART of the address is wrong
// in the error's `errorType` (see isEmailAddress: 'format', 'localPart',
// 'domain', 'addressLiteral'). One local so the mode is computed once; a
// declared length bound that fails folds in as 'length' rather than running
// the engine at all. formatPath stays ['emailRfc'].
func emailRfcErrorsBlock(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr string) string {
	mode := ctx.NextLocalVar("emMode")
	init := emailRfcCall(ctx, params, vλl)
	if conditions := lengthConditions(params, vλl, ctx); len(conditions) > 0 {
		init = "(" + strings.Join(conditions, " && ") + ") ? " + init + " : 'length'"
	}
	errCall := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "email", "emailRfc",
		strconv.Quote(params["emailRfc"].(string)), formats.FormatErrorTypeProp(mode))
	return "{const " + mode + "=" + init + ";if (" + mode + "!=='') " + errCall + ";}"
}

func (emailEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasRfc(annotation.Params) {
		return emailRfcErrorsBlock(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailErrorsBlockFor(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "email")
}

// emailHasParts reports whether the decomposition path applies — i.e.
// the params carry a localPart or domain sub-format (validateParams
// requires them together, but either signals decomposition).
func emailHasParts(params map[string]any) bool {
	if _, ok := params["localPart"].(map[string]any); ok {
		return true
	}
	_, ok := params["domain"].(map[string]any)
	return ok
}

// emailValidateExprFor builds the decomposition validate IIFE (ref:
// email.runtype.ts:78-88): root length, split on the last '@', validate
// localPart and the domain half. The bound `e` and the locals are
// arrow-scoped, so fixed names are collision-free.
func emailValidateExprFor(ctx formats.EmitContext, params map[string]any, valExpr string) string {
	localPartParams, _ := params["localPart"].(map[string]any)
	domainParams, _ := params["domain"].(map[string]any)

	rootConds := strings.Join(stringConditions(ctx, params, "e"), " && ")
	localPartConds := strings.Join(stringConditions(ctx, localPartParams, "localPart"), " && ")

	var b strings.Builder
	b.WriteString("((e) => {")
	if rootConds != "" {
		b.WriteString("if (!(" + rootConds + ")) return false;")
	}
	b.WriteString("const atPos = e.lastIndexOf('@');")
	b.WriteString("if (atPos === -1) return false;")
	b.WriteString("const localPart = e.substring(0, atPos);")
	b.WriteString("const domain = e.substring(atPos + 1);")
	if localPartConds != "" {
		b.WriteString("if (!(" + localPartConds + ")) return false;")
	}
	if domainParams != nil {
		b.WriteString("if (!(" + domainSubCheckExpr(ctx, domainParams, "domain") + ")) return false;")
	}
	b.WriteString("return true;")
	b.WriteString("})(" + valExpr + ")")
	return b.String()
}

// emailErrorsBlockFor builds the decomposition validationErrors block (ref:
// email.runtype.ts:109-117). When '@' is absent we push that error and
// skip the part checks (avoids spurious localPart/domain errors over the
// un-splittable value); otherwise both halves accumulate their errors.
//
// The local half's errors name it in `errorType` ('localPart'), and a missing
// '@' reports 'format'. The domain half needs no tag: its errors already carry
// the `domain` format NAME, with the label / tld modes of a decomposed domain.
// The whole-address bounds carry none — formatPath already names them.
func emailErrorsBlockFor(ctx formats.EmitContext, params map[string]any, valExpr, pathExpr, errorsArr string) string {
	localPartParams, _ := params["localPart"].(map[string]any)
	domainParams, _ := params["domain"].(map[string]any)

	rootErrs := strings.Join(stringErrorStatements(ctx, params, "e", pathExpr, errorsArr, "email", ""), ";")
	localPartErrs := strings.Join(stringErrorStatements(ctx, localPartParams, "localPart", pathExpr, errorsArr, "email", jsquote.Double("localPart")), ";")

	var b strings.Builder
	b.WriteString("{const e = " + valExpr + ";")
	if rootErrs != "" {
		b.WriteString(rootErrs + ";")
	}
	b.WriteString("const atPos = e.lastIndexOf('@');")
	b.WriteString("if (atPos === -1) " +
		formatErrWithType(pathExpr, errorsArr, "email", "@", "'Email missing @ symbol'", jsquote.Double("format")) + ";")
	b.WriteString("else {")
	b.WriteString("const localPart = e.substring(0, atPos);")
	b.WriteString("const domain = e.substring(atPos + 1);")
	if localPartErrs != "" {
		b.WriteString(localPartErrs + ";")
	}
	if domainParams != nil {
		b.WriteString(domainSubErrorsStmts(ctx, domainParams, "domain", pathExpr, errorsArr, "") + ";")
	}
	b.WriteString("}")
	b.WriteString("}")
	return b.String()
}

// EmitFormatTransform applies the rewrite declared under `transform`, and
// nothing otherwise: an email's local part is case-sensitive by the letter of
// the RFC, so lowercasing is the field's decision (`{lowercase: true}`), not
// the format's.
func (emailEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return formats.EmitStringTransform(annotation.Params, vλl)
}

// ValidateParams ports EmailRunTypeFormat.validateParams
// (ref: email.runtype.ts:152-187): pattern is mutually exclusive with the
// localPart/domain decomposition, and maxLength stays in range.
func (emailEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	_, hasLocalPart := params["localPart"].(map[string]any)
	_, hasDomain := params["domain"].(map[string]any)
	_, hasPattern := params["pattern"]
	if hasPattern && (hasLocalPart || hasDomain) {
		errs = append(errs, "FormatEmail: cannot combine `pattern` with `localPart`/`domain`")
	}
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok && value > 254 {
		errs = append(errs, "FormatEmail: `maxLength` cannot be greater than 254")
	}
	errs = append(errs, formats.ValidateTransformParams(params, "FormatEmail")...)
	return errs
}
