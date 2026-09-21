package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// uuidEmitter implements the format named "uuid", FormatUUIDv4 / FormatUUIDv7 in `@mionjs/run-types/formats`.
// It calls the `isUUID` pure fn rather than inlining: the character-class check is a 36-character loop, whose
// body at every call site would explode the cache module's bytes.
type uuidEmitter struct{}

func init() {
	formats.Register(uuidEmitter{})
}

func (uuidEmitter) Name() string                    { return "uuid" }
func (uuidEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// EmitValidateCheck returns `isUUID(v, {version: '<v>'})`.
func (uuidEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	version, ok := readVersion(annotation.Params)
	if !ok {
		// No-op on an unrecognised version so the base-kind validator still runs; ValidateParams reports it.
		return ""
	}
	aliasKey := formats.PureFnAlias(ctx, purefnids.IsUUID)
	return aliasKey + "(" + vλl + ",{version:" + strconv.Quote(version) + "})"
}

// EmitValidationErrorsCheck pushes ONE error: a UUID either is or isn't valid, with no second failure mode.
// The error carries the `version` param, so a consumer sees which param drove the failure.
func (uuidEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	version, ok := readVersion(annotation.Params)
	if !ok {
		return ""
	}
	aliasKey := formats.PureFnAlias(ctx, purefnids.IsUUID)
	call := aliasKey + "(" + vλl + ",{version:" + strconv.Quote(version) + "})"
	return "if (!(" + call + ")) " +
		formats.FormatErrCall(pathExpr, errorsArr, "string", "uuid", "version", strconv.Quote(version))
}

// ValidateParams: a `version`, when present, must be '4', '7' or 'any', the version-agnostic UUID.
func (uuidEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	if _, present := annotation.Params["version"]; !present {
		return nil
	}
	version, ok := readVersion(annotation.Params)
	if !ok || (version != "4" && version != "7" && version != "any") {
		return []string{"FormatUUID: `version` must be '4', '7' or 'any'"}
	}
	return nil
}

// readVersion accepts a stringified or numeric version param, kept loose so a new UUID version needs no Go release.
func readVersion(params map[string]any) (string, bool) {
	raw, ok := params["version"]
	if !ok {
		return "", false
	}
	switch typed := raw.(type) {
	case string:
		if typed == "" {
			return "", false
		}
		return typed, true
	case float64:
		return strconv.FormatInt(int64(typed), 10), true
	case int:
		return strconv.Itoa(typed), true
	}
	return "", false
}
