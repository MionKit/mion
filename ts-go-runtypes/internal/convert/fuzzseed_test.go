package convert_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// The seeding policy the Go fuzz sweeps share with the JS lanes lives in
// internal/testfixtures (fuzzseed.go), so both ends derive a seed the same way.
// entrySeed is the testing.T-shaped wrapper: it fails the test on a bad
// MION_FUZZ_SEED and logs the command that replays the run.
func entrySeed(t *testing.T, lane string) int64 {
	t.Helper()
	seed, origin, err := testfixtures.FuzzSeed(lane)
	if err != nil {
		t.Fatal(err)
	}
	t.Log(origin)
	return seed
}

// A seed spelled the way the JS lanes spell it must replay here. Their
// fuzzPolicy.ts accepts decimal or 0x-hex and renders every replay command in
// hex, so copying a JS finding's command into a Go sweep has to work; a
// decimal-only parse used to fail it with "invalid syntax". CI never caught it
// because the workflows seed from github.run_id, which is decimal.
func TestEntrySeed_AcceptsTheSpellingsTheJSLanesEmit(t *testing.T) {
	for _, probe := range []struct {
		name string
		raw  string
		want int64
	}{
		{"hex as the JS lanes print it", "0x90f3baf6", 0x90f3baf6},
		{"decimal as the workflows set it", "2431106294", 2431106294},
		{"uppercase hex", "0XFF", 255},
	} {
		t.Run(probe.name, func(t *testing.T) {
			t.Setenv("MION_FUZZ_SEED", probe.raw)
			if got := entrySeed(t, "probe"); got != probe.want {
				t.Fatalf("MION_FUZZ_SEED=%s: seed = %d, want %d", probe.raw, got, probe.want)
			}
		})
	}
}

