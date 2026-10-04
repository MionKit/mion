package diagnostics

import "testing"

func TestResolveLevels(t *testing.T) {
	if show, err := ResolveLevels(""); err != nil || show {
		t.Errorf("unset must hide Info; got show=%v err=%v", show, err)
	}
	if show, err := ResolveLevels(levelsAll); err != nil || !show {
		t.Errorf("%q must show Info; got show=%v err=%v", levelsAll, show, err)
	}
	if _, err := ResolveLevels("warning"); err == nil {
		t.Error("an unknown value must error, a typo would otherwise read as working")
	}
}

func TestShownHidesOnlyInfo(t *testing.T) {
	for _, level := range []Level{LevelError, LevelRuntimeError, LevelWarning} {
		if !Shown(Diagnostic{Level: level}, false) {
			t.Errorf("level %d must always show", level)
		}
	}
	if Shown(Diagnostic{Level: LevelInfo}, false) {
		t.Error("Info must be hidden by default")
	}
	if !Shown(Diagnostic{Level: LevelInfo}, true) {
		t.Error("Info must show with levels: all")
	}
}

func TestResolveLogStyle(t *testing.T) {
	for value, want := range map[string]bool{"": true, LogStyleGrouped: true, LogStyleLines: false} {
		if grouped, err := ResolveLogStyle(value); err != nil || grouped != want {
			t.Errorf("ResolveLogStyle(%q) = %v, %v; want %v", value, grouped, err, want)
		}
	}
	if _, err := ResolveLogStyle("line"); err == nil {
		t.Error("an unknown value must error, a typo would otherwise read as working")
	}
}
