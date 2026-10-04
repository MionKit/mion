package diagnostics

import "fmt"

// The two `logStyle` values; unset groups.
const (
	LogStyleGrouped = "grouped"
	LogStyleLines   = "lines"
)

// ResolveLogStyle validates a configured `logStyle` value; "" (unset) groups.
func ResolveLogStyle(value string) (grouped bool, err error) {
	switch value {
	case "", LogStyleGrouped:
		return true, nil
	case LogStyleLines:
		return false, nil
	}
	return false, fmt.Errorf("logStyle: unknown value %q, the accepted values are %q and %q", value, LogStyleGrouped, LogStyleLines)
}
