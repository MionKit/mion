package formats

// errorKeySamples must reach every validation-errors branch; a param in neither it nor excludedParams fails the tests.
var errorKeySamples = map[string][]map[string]any{
	"numberFormat": {
		{"integer": true, "min": 0.0, "max": 10.0, "lt": 11.0, "gt": -1.0, "multipleOf": 0.5, "multipleOfTolerance": 0.001, "isCurrency": true},
		{"integer": false, "float": true},
	},
	"bigintFormat": {
		{"min": 0.0, "max": 10.0, "lt": 11.0, "gt": -1.0, "multipleOf": 2.0},
	},
	"stringFormat": {
		{
			"maxLength": 10.0, "minLength": 1.0, "length": 5.0, "pattern": samplePattern,
			"allowedChars": map[string]any{"val": "abc"}, "disallowedChars": map[string]any{"val": "xyz"},
			"allowedValues": map[string]any{"val": []any{"a"}}, "disallowedValues": map[string]any{"val": []any{"b"}},
			"mockSamples": []any{"abc"}, "transform": map[string]any{"trim": true}, "isRegex": true,
		},
		{"contentMediaType": "application/json", "contentEncoding": "base64"},
	},
	"url": {
		{"maxLength": 10.0, "minLength": 1.0, "pattern": samplePattern, "mockSamples": []any{"a"}, "transform": map[string]any{"trim": true}},
	},
	"uuid": {
		{"version": "4"},
		{"version": "any"},
	},
	"ip": {
		{"version": 4.0, "allowLocalHost": true, "transform": map[string]any{"lowercase": true}},
		{"version": "any", "allowPort": true},
		{},
	},
	"creditCard": {
		{"networks": []any{"visa"}, "separators": " -", "transform": map[string]any{"stripSeparators": true}},
		{},
	},
	"email": {
		{"maxLength": 10.0, "minLength": 1.0, "pattern": samplePattern, "mockSamples": []any{"a@b.co"}, "transform": map[string]any{"trim": true}},
		{"emailRfc": "ascii", "maxLength": 254.0},
		{
			"maxLength": 254.0,
			"localPart": map[string]any{"maxLength": 64.0, "pattern": samplePattern},
			"domain":    map[string]any{"maxParts": 4.0, "minParts": 2.0, "names": map[string]any{"maxLength": 63.0}, "tld": map[string]any{"minLength": 2.0}},
		},
	},
	"domain": {
		{"maxLength": 253.0, "minLength": 5.0, "pattern": samplePattern, "allowedValues": map[string]any{"val": []any{"a.com"}}, "mockSamples": []any{"a.com"}, "transform": map[string]any{"lowercase": true}},
		{"idna": "ascii", "maxLength": 253.0},
		{"maxParts": 4.0, "minParts": 2.0, "names": map[string]any{"maxLength": 63.0, "pattern": samplePattern}, "tld": map[string]any{"minLength": 2.0}},
		{"allowedValues": map[string]any{"val": []any{"a.com"}}, "names": map[string]any{"maxLength": 63.0}, "tld": map[string]any{"minLength": 2.0}},
	},
	"date": {
		{"format": "ISO", "min": "2020-01-01", "max": "2030-01-01", "gt": "2019-12-31", "lt": "2030-01-02"},
		{},
	},
	"time": {
		{"format": "ISO", "min": "08:00:00Z", "max": "18:00:00Z", "gt": "07:59:59Z", "lt": "18:00:01Z"},
		{},
	},
	"dateTime": {
		{
			"date": map[string]any{"format": "ISO"}, "time": map[string]any{"format": "ISO"}, "splitChar": "T",
			"min": "2020-01-01T00:00:00", "max": "2030-01-01T00:00:00", "gt": "2019-12-31T00:00:00", "lt": "2030-01-02T00:00:00",
		},
		{},
	},
	"nativeDate":             {sampleBounds("2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z")},
	"temporalInstant":        {sampleBounds("2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z")},
	"temporalZonedDateTime":  {sampleBounds("2020-01-01T00:00:00+00:00[UTC]", "2030-01-01T00:00:00+00:00[UTC]")},
	"temporalPlainDate":      {sampleBounds("2020-01-01", "2030-01-01")},
	"temporalPlainTime":      {sampleBounds("08:00:00", "18:00:00")},
	"temporalPlainDateTime":  {sampleBounds("2020-01-01T00:00:00", "2030-01-01T00:00:00")},
	"temporalPlainYearMonth": {sampleBounds("2020-01", "2030-01")},
	"formattedArray": {
		{"minItems": 1.0, "maxItems": 5.0, "uniqueItems": true},
	},
	"formattedSet": {
		{"minItems": 1.0, "maxItems": 5.0, "uniqueItems": true},
	},
	"formattedMap": {
		{"minItems": 1.0, "maxItems": 5.0, "uniqueItems": true},
	},
	"formattedObject": {
		{"minProperties": 1.0, "maxProperties": 5.0, "closed": []any{"id"}, "closedPatterns": []any{"^x_"}, "additionalOwn": []any{"id"}},
	},
}

const boundAliasReason = "renamed to min/max/gt/lt before any emitter runs"

// excludedParams are params deliberately left out of the samples, each with the reason.
var excludedParams = map[string]map[string]string{
	"numberFormat":           boundAliases(),
	"bigintFormat":           boundAliases(),
	"date":                   boundAliases(),
	"time":                   boundAliases(),
	"dateTime":               boundAliases(),
	"nativeDate":             boundAliases(),
	"temporalInstant":        boundAliases(),
	"temporalZonedDateTime":  boundAliases(),
	"temporalPlainDate":      boundAliases(),
	"temporalPlainTime":      boundAliases(),
	"temporalPlainDateTime":  boundAliases(),
	"temporalPlainYearMonth": boundAliases(),
	"formattedArray":         containsSentinel(),
	"formattedSet":           containsSentinel(),
	"formattedMap":           containsSentinel(),
	"formattedObject": {
		"patternProperties": "rides its own sentinel, validated as a child type, not by this emitter",
		"propertyNames":     "rides its own sentinel, validated as a child type, not by this emitter",
	},
}

var samplePattern = map[string]any{"source": "^a", "flags": ""}

func sampleBounds(low, high string) map[string]any {
	return map[string]any{"min": low, "max": high, "gt": low, "lt": high}
}

func boundAliases() map[string]string {
	return map[string]string{"minimum": boundAliasReason, "maximum": boundAliasReason, "exclusiveMinimum": boundAliasReason, "exclusiveMaximum": boundAliasReason}
}

func containsSentinel() map[string]string {
	reason := "rides the contains sentinel, validated as a child type, not by this emitter"
	return map[string]string{"contains": reason, "minContains": reason, "maxContains": reason}
}
