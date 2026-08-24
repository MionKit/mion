package diskcache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// TestStore_NilSafe — a nil Store is a valid "no caching" sentinel; both
// methods must short-circuit without touching the filesystem.
func TestStore_NilSafe(t *testing.T) {
	var s *Store
	entry, ok, err := s.ReadRT("abc123", "val")
	if entry != nil || ok || err != nil {
		t.Fatalf("nil ReadRT: want (nil,false,nil), got (%v,%v,%v)", entry, ok, err)
	}
	if err := s.WriteRT("abc123", "val", RTEntry{}); err != nil {
		t.Fatalf("nil WriteRT: want nil, got %v", err)
	}
}

// TestStore_NewEmpty — New with an empty baseDir or fingerprint returns
// nil so the disabled-caching path is the same as no Store.
func TestStore_NewEmpty(t *testing.T) {
	if s := New("", "fp"); s != nil {
		t.Fatalf("empty baseDir: want nil, got %+v", s)
	}
	if s := New("/tmp/x", ""); s != nil {
		t.Fatalf("empty fingerprint: want nil, got %+v", s)
	}
}

// TestStore_RoundTrip — write an entry, read it back, expect every field
// preserved byte-for-byte.
func TestStore_RoundTrip(t *testing.T) {
	root := t.TempDir()
	s := New(root, "fp1")
	if s == nil {
		t.Fatal("New: got nil")
	}

	in := RTEntry{
		Format:       FormatVersion,
		StructuralID: "5{6,7}",
		ArgsText:     "init('val_abc123', 'User', '…', false, [], [], function(utl){…});",
		ChildRefs: []ChildRef{
			{StructuralID: "1:atomic", Hash: "xyz"},
			{StructuralID: "2:atomic", Hash: "qrs"},
		},
	}
	if err := s.WriteRT("abc123", "val", in); err != nil {
		t.Fatalf("WriteRT: %v", err)
	}

	out, ok, err := s.ReadRT("abc123", "val")
	if err != nil {
		t.Fatalf("ReadRT err: %v", err)
	}
	if !ok || out == nil {
		t.Fatalf("ReadRT miss after write")
	}
	if out.StructuralID != in.StructuralID {
		t.Errorf("StructuralID: got %q want %q", out.StructuralID, in.StructuralID)
	}
	if out.ArgsText != in.ArgsText {
		t.Errorf("ArgsText: got %q want %q", out.ArgsText, in.ArgsText)
	}
	if len(out.ChildRefs) != len(in.ChildRefs) {
		t.Fatalf("ChildRefs len: got %d want %d", len(out.ChildRefs), len(in.ChildRefs))
	}
	for i, ref := range out.ChildRefs {
		if ref != in.ChildRefs[i] {
			t.Errorf("ChildRefs[%d]: got %+v want %+v", i, ref, in.ChildRefs[i])
		}
	}
}

// TestStore_ReadMiss — ENOENT, malformed JSON, and stale format must all
// return (nil, false, nil) so the caller's miss-handling path is uniform.
func TestStore_ReadMiss(t *testing.T) {
	root := t.TempDir()
	s := New(root, "fp1")

	t.Run("ENOENT", func(t *testing.T) {
		entry, ok, err := s.ReadRT("nope", "val")
		if entry != nil || ok || err != nil {
			t.Fatalf("want (nil,false,nil), got (%v,%v,%v)", entry, ok, err)
		}
	})

	t.Run("malformed JSON", func(t *testing.T) {
		dir := filepath.Join(root, "fp1", "bad")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "val.json"), []byte("{not json"), 0o644); err != nil {
			t.Fatal(err)
		}
		entry, ok, err := s.ReadRT("bad", "val")
		if entry != nil || ok {
			t.Fatalf("malformed: want (nil,false,_), got (%v,%v)", entry, ok)
		}
		if err != nil {
			t.Fatalf("malformed: unexpected err %v", err)
		}
	})

	t.Run("stale format", func(t *testing.T) {
		dir := filepath.Join(root, "fp1", "old")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		// Format=99 simulates a future incompatible layout; current
		// binary must refuse to read it.
		body, _ := json.Marshal(RTEntry{Format: 99, StructuralID: "x", ArgsText: "y"})
		if err := os.WriteFile(filepath.Join(dir, "val.json"), body, 0o644); err != nil {
			t.Fatal(err)
		}
		entry, ok, _ := s.ReadRT("old", "val")
		if entry != nil || ok {
			t.Fatalf("stale: want (nil,false), got (%v,%v)", entry, ok)
		}
	})
}

// TestStore_WriteAtomic — concurrent writers must not produce a torn file;
// any successful ReadRT must see a complete, parseable entry. The
// temp+rename in WriteRT is the guarantee being verified.
func TestStore_WriteAtomic(t *testing.T) {
	root := t.TempDir()
	s := New(root, "fp1")
	const goroutines = 16
	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			entry := RTEntry{Format: FormatVersion, StructuralID: "s", ArgsText: "line"}
			if err := s.WriteRT("typeID", "val", entry); err != nil {
				t.Errorf("WriteRT[%d]: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	out, ok, err := s.ReadRT("typeID", "val")
	if err != nil {
		t.Fatalf("ReadRT: %v", err)
	}
	if !ok {
		t.Fatal("ReadRT miss after concurrent writes")
	}
	if out.StructuralID != "s" || out.ArgsText != "line" {
		t.Errorf("torn read: %+v", out)
	}
}

// TestFingerprint_OptionIsolation — distinct hash-length configurations
// produce distinct fingerprints so their caches live under different
// subdirs and never share entries.
func TestFingerprint_OptionIsolation(t *testing.T) {
	a := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "code"})
	b := Fingerprint(FingerprintInputs{HashLength: 8, EmitMode: "code"})
	if a == b {
		t.Errorf("hashLength change should move fingerprint: both %q", a)
	}
	if c := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "functions"}); c == a {
		t.Errorf("emitMode change should move fingerprint: both %q", a)
	}
	if e := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "both"}); e == a {
		t.Errorf("emitMode both should differ from code: both %q", a)
	}
	if f := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "code", InlineMode: "allInternal"}); f == a {
		t.Errorf("inlineMode change should move fingerprint: both %q", a)
	}
	if g := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "code", PatternSampleCount: 100}); g == a {
		t.Errorf("patternSampleCount change should move fingerprint: both %q", a)
	}
	if h := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "code", PatternSampleRetries: 10}); h == a {
		t.Errorf("patternSampleRetries change should move fingerprint: both %q", a)
	}
	if d := Fingerprint(FingerprintInputs{HashLength: 7, EmitMode: "code"}); d != a {
		t.Errorf("identical inputs should produce identical fingerprint: %q vs %q", a, d)
	}
}

// TestFingerprint_BinaryIdentityIsolation — a rebuilt binary (new stamp) or
// a new release (new version) moves the fingerprint, so a dev binary with
// changed emitters never serves the previous build's cached function
// bodies.
func TestFingerprint_BinaryIdentityIsolation(t *testing.T) {
	base := Fingerprint(FingerprintInputs{BinaryVersion: "0.11.0", BinaryStamp: "100-200", HashLength: 7, EmitMode: "code"})
	if rebuilt := Fingerprint(FingerprintInputs{BinaryVersion: "0.11.0", BinaryStamp: "300-200", HashLength: 7, EmitMode: "code"}); rebuilt == base {
		t.Errorf("binary stamp change should move fingerprint: both %q", base)
	}
	if released := Fingerprint(FingerprintInputs{BinaryVersion: "0.12.0", BinaryStamp: "100-200", HashLength: 7, EmitMode: "code"}); released == base {
		t.Errorf("binary version change should move fingerprint: both %q", base)
	}
	if same := Fingerprint(FingerprintInputs{BinaryVersion: "0.11.0", BinaryStamp: "100-200", HashLength: 7, EmitMode: "code"}); same != base {
		t.Errorf("identical binary identity should produce identical fingerprint: %q vs %q", base, same)
	}
}
