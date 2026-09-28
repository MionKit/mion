package diagnostics

import "fmt"

// LevelsAll is the one accepted value of the `levels` setting: it shows LevelInfo findings, which every
// host hides by default. Hiding never changes a halt, an Info never halts anything.
const LevelsAll = "all"

// ResolveLevels validates a configured `levels` value; "" (unset) hides Info.
func ResolveLevels(value string) (showInfo bool, err error) {
	switch value {
	case "":
		return false, nil
	case LevelsAll:
		return true, nil
	}
	return false, fmt.Errorf("levels: unknown value %q, the only accepted value is %q", value, LevelsAll)
}

// Shown reports whether a host prints this diagnostic; the level is read off the wire.
func Shown(diagnostic Diagnostic, showInfo bool) bool {
	return showInfo || diagnostic.Level != LevelInfo
}
