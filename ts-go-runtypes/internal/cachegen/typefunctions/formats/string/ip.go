package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ipEmitter implements the format named "ip" — FormatIP / FormatIPv4 /
// FormatIPv6 / *WithPort in `ts-runtypes/formats`. Dispatches
// to pf_isIPV4 / pf_isIPV6 based on the `version` param (4, 6, or
// 'any' → OR of both), passing the whole params object so the pure fn
// can honour allowLocalHost / allowPort. Mirrors the IPRunTypeFormat
// (ref: packages/type-formats/src/string/ip.runtype.ts).
type ipEmitter struct{}

func init() {
	formats.Register(ipEmitter{})
}

func (ipEmitter) Name() string                    { return "ip" }
func (ipEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// ipVersion reads the `version` param. Accepts 4 / 6 (numeric) and
// 'any' (string). Defaults to "any" when absent — matches the
// DEFAULT_IP_PARAMS.
func ipVersion(params map[string]any) string {
	raw, ok := params["version"]
	if !ok {
		return "any"
	}
	switch typed := raw.(type) {
	case string:
		return typed
	case float64:
		if typed == 4 {
			return "4"
		}
		if typed == 6 {
			return "6"
		}
	}
	return "any"
}

// ipCall renders one parser call. The pure fns return the failure MODE, so
// "valid" is the empty string and validate compares against it.
func ipCall(ctx formats.EmitContext, fnName, vλl, literal string) string {
	return pureFnAlias(ctx, fnName) + "(" + vλl + "," + literal + ")"
}

// ipCheckExpr builds the boolean validate expression for the resolved
// version. v4/v6 emit a single call; 'any' ORs both.
func ipCheckExpr(params map[string]any, vλl string, ctx formats.EmitContext) string {
	literal := jsParamsLiteral(params)
	switch ipVersion(params) {
	case "4":
		return ipCall(ctx, "isIPV4", vλl, literal) + "===''"
	case "6":
		return ipCall(ctx, "isIPV6", vλl, literal) + "===''"
	default:
		return "(" + ipCall(ctx, "isIPV4", vλl, literal) + "==='' || " + ipCall(ctx, "isIPV6", vλl, literal) + "==='')"
	}
}

func (ipEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return ipCheckExpr(annotation.Params, vλl, ctx)
}

// EmitValidationErrorsCheck — with `allowPort` an address has TWO ways to
// fail, and the error names which in its `errorType`: 'address' (not an
// address of the accepted version) or 'port' (a good address, bad port).
// Without `allowPort` there is only one way to fail, so the field stays off —
// a filler value would be worse than nothing.
//
// Under `version: 'any'` both parsers get a say and a 'port' from either wins:
// the address half then parsed under at least one version, so the port is the
// one thing wrong.
func (ipEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	version := ipVersion(params)
	versionLiteral := "'" + version + "'"
	if version == "4" || version == "6" {
		versionLiteral = version
	}
	if allowPort, _ := params["allowPort"].(bool); !allowPort {
		return "if (!(" + ipCheckExpr(params, vλl, ctx) + ")) " +
			formats.FormatErrCall(pathExpr, errorsArr, "string", "ip", "version", versionLiteral)
	}
	literal := jsParamsLiteral(params)
	mode := ctx.NextLocalVar("ipMode")
	errCall := formats.FormatErrCallWith(pathExpr, errorsArr, "string", "ip", "version", versionLiteral,
		formats.FormatErrorTypeProp(mode))
	switch version {
	case "4":
		return "{const " + mode + "=" + ipCall(ctx, "isIPV4", vλl, literal) + ";if (" + mode + "!=='') " + errCall + ";}"
	case "6":
		return "{const " + mode + "=" + ipCall(ctx, "isIPV6", vλl, literal) + ";if (" + mode + "!=='') " + errCall + ";}"
	default:
		mode4 := ctx.NextLocalVar("ipMode4")
		mode6 := ctx.NextLocalVar("ipMode6")
		return "{const " + mode4 + "=" + ipCall(ctx, "isIPV4", vλl, literal) + ";" +
			"const " + mode6 + "=" + mode4 + "==='' ? '' : " + ipCall(ctx, "isIPV6", vλl, literal) + ";" +
			"const " + mode + "=" + mode4 + "==='' || " + mode6 + "==='' ? '' : " +
			mode4 + "==='port' || " + mode6 + "==='port' ? 'port' : 'address';" +
			"if (" + mode + "!=='') " + errCall + ";}"
	}
}

// EmitFormatTransform lowercases the IP (ref: ip.runtype.ts:44 —
// canonicalises IPv6 hex digits to lower case; a no-op for IPv4).
func (ipEmitter) EmitFormatTransform(_ *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}

// ValidateParams checks the `version` param is 4, 6, or 'any' when present.
func (ipEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	raw, present := annotation.Params["version"]
	if !present {
		return nil
	}
	switch value := raw.(type) {
	case string:
		if value == "any" || value == "4" || value == "6" {
			return nil
		}
	case float64:
		if value == 4 || value == 6 {
			return nil
		}
	}
	return []string{"FormatIP: `version` must be 4, 6, or 'any'"}
}
