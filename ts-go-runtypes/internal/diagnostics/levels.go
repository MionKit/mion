package diagnostics

import "fmt"

// levelsAll shows LevelInfo, hidden by default; hiding never changes a halt, since an Info never halts.
const levelsAll = "all"

// ResolveLevels validates a configured `levels` value; "" (unset) hides Info.
func ResolveLevels(value string) (showInfo bool, err error) {
	switch value {
	case "":
		return false, nil
	case levelsAll:
		return true, nil
	}
	return false, fmt.Errorf("levels: unknown value %q, the only accepted value is %q", value, levelsAll)
}

// Shown reports whether a host prints this diagnostic; the level is read off the wire.
func Shown(diagnostic Diagnostic, showInfo bool) bool {
	return showInfo || diagnostic.Level != LevelInfo
}
